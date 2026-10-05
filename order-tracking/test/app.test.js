// Інтеграційні тести: потрібен PostgreSQL. База з TEST_DATABASE_URL очищується перед запуском.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders_test';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-uploads-'));

const { pool } = await import('../src/db.js');
const { migrate } = await import('../src/migrate.js');
const { createApp } = await import('../src/app.js');

let server;
let base;

before(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  await pool.end();
  fs.rmSync(process.env.UPLOADS_DIR, { recursive: true, force: true });
});

function form(fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new Blob([file.content], { type: 'application/pdf' }), file.name);
  return fd;
}

const post = (url, body) => fetch(base + url, { method: 'POST', body, redirect: 'manual' });
const html = async (url) => (await fetch(base + url)).text();

async function createContract(fields = {}, file) {
  const res = await post('/contracts', form({
    number: 'Д-125/2026',
    counterparty: 'ТОВ "Постачальник"',
    contract_date: '2026-09-01',
    expected_delivery_date: '2026-10-20',
    'items[0][name]': 'Болт М8',
    'items[0][quantity]': '100',
    'items[0][unit]': 'шт',
    ...fields,
  }, file));
  assert.equal(res.status, 302, await res.text());
  return Number(res.headers.get('location').split('/').pop());
}

async function itemRow(contractId, name) {
  const { rows: [row] } = await pool.query(
    `SELECT i.id, i.quantity, i.cancelled_quantity, COALESCE(SUM(l.quantity), 0) AS received
       FROM order_items i LEFT JOIN delivery_lines l ON l.order_item_id = i.id
      WHERE i.contract_id = $1 AND i.name = $2 GROUP BY i.id`,
    [contractId, name],
  );
  return row;
}

test('повний цикл: 100 замовлено, 20 отримали, 20 не зможуть, 60 очікуємо', async () => {
  const id = await createContract({}, { name: 'Договір 125.pdf', content: 'pdf' });
  const item = await itemRow(id, 'Болт М8');

  let res = await post(`/contracts/${id}/deliveries`, form({
    date: '2026-09-15',
    invoice_number: 'ВН-001',
    'lines[0][item_id]': String(item.id),
    'lines[0][quantity]': '20',
  }, { name: 'nakladna.pdf', content: 'scan' }));
  assert.equal(res.status, 302);

  res = await post(`/contracts/${id}/update`, new URLSearchParams({
    expected_delivery_date: '2026-10-25',
    'rows[0][id]': String(item.id),
    'rows[0][cancelled]': '20',
    'rows[0][reason]': 'Немає на складі',
  }));
  assert.equal(res.status, 302);

  const after = await itemRow(id, 'Болт М8');
  assert.equal(after.received, 20);
  assert.equal(after.cancelled_quantity, 20);

  const page = await html(`/contracts/${id}`);
  assert.match(page, /Частково поставлено/);
  assert.match(page, /<td class="text-end text-nowrap fw-semibold">60<\/td>/);
  assert.match(page, /Договір 125\.pdf/);
  assert.match(page, /25\.10\.2026/);

  // Не можна прийняти більше, ніж очікується
  res = await post(`/contracts/${id}/deliveries`, form({
    date: '2026-09-20',
    invoice_number: 'ВН-002',
    'lines[0][item_id]': String(item.id),
    'lines[0][quantity]': '61',
  }));
  assert.equal(res.status, 422);
  assert.match(await res.text(), /Очікується лише 60/);
});

test('пошук за номером, найменуванням, контрагентом і датою (без урахування регістру)', async () => {
  await createContract({
    number: 'ПС-7',
    counterparty: 'ПП Іваненко',
    contract_date: '2025-03-10',
    expected_delivery_date: '',
    'items[0][name]': 'Фарба біла',
  });

  const found = async (qs) => (await html(`/contracts?${qs}`)).match(/class="row-link"/g)?.length ?? 0;
  assert.equal(await found('number=пс-7'), 1);
  assert.equal(await found(`item=${encodeURIComponent('ФАРБА')}`), 1);
  assert.equal(await found(`counterparty=${encodeURIComponent('іваненко')}`), 1);
  assert.equal(await found('dateFrom=2025-01-01&dateTo=2025-12-31'), 1);
  assert.equal(await found('dateFrom=2026-01-01&number=пс'), 0);
  assert.equal(await found(`item=${encodeURIComponent('%')}`), 0);
});

test('валідація форми договору і унікальність номера', async () => {
  let res = await post('/contracts', form({ number: '', counterparty: '', contract_date: '' }));
  assert.equal(res.status, 422);
  const body = await res.text();
  assert.match(body, /Вкажіть номер договору/);
  assert.match(body, /Додайте хоча б одне найменування/);

  res = await post('/contracts', form({
    number: 'д-125/2026',
    counterparty: 'тов "постачальник"',
    contract_date: '2026-09-01',
    'items[0][name]': 'x',
    'items[0][quantity]': '1',
  }));
  assert.equal(res.status, 422);
  assert.match(await res.text(), /вже існує/);
});

test('редагування не дає зменшити кількість нижче отриманого і видалити найменування з поставками', async () => {
  const { rows: [c] } = await pool.query(`SELECT id FROM contracts WHERE number = 'Д-125/2026'`);
  const item = await itemRow(c.id, 'Болт М8');
  const base = {
    number: 'Д-125/2026', counterparty: 'ТОВ "Постачальник"', contract_date: '2026-09-01',
  };

  let res = await post(`/contracts/${c.id}/edit`, form({
    ...base, 'items[0][id]': String(item.id), 'items[0][name]': 'Болт М8', 'items[0][quantity]': '30', 'items[0][unit]': 'шт',
  }));
  assert.equal(res.status, 422);
  assert.match(await res.text(), /Не менше 40/);

  res = await post(`/contracts/${c.id}/edit`, form({
    ...base, 'items[0][name]': 'Інше', 'items[0][quantity]': '5', 'items[0][unit]': 'шт',
  }));
  assert.equal(res.status, 422);
  assert.match(await res.text(), /Не можна видалити/);
});

test('видалення договору прибирає поставки і файли', async () => {
  const { rows: [c] } = await pool.query(`SELECT id FROM contracts WHERE number = 'Д-125/2026'`);
  const res = await post(`/contracts/${c.id}/delete`);
  assert.equal(res.status, 302);

  const { rows: [counts] } = await pool.query(`SELECT
      (SELECT count(*)::int FROM contracts WHERE id = $1) AS contracts,
      (SELECT count(*)::int FROM deliveries WHERE contract_id = $1) AS deliveries,
      (SELECT count(*)::int FROM files) AS files`, [c.id]);
  assert.deepEqual(counts, { contracts: 0, deliveries: 0, files: 0 });
  assert.equal(fs.readdirSync(process.env.UPLOADS_DIR).length, 0);
});
