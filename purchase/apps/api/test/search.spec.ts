import type { ContractDetails, ContractSummary, Page, SearchResults } from '@kk-gov-purchase/shared';
import { matchRanges, searchNorm } from '../../web/src/lib/search-norm';
import { contract, createTestApp, deliveryReq, TestApp } from './helpers';

let t: TestApp;
let a: ContractDetails;
let b: ContractDetails;

beforeAll(async () => {
  t = await createTestApp();
  const http = t.admin;
  a = (await http.post('/api/contracts').send(contract({
    number: 'Д-125/2026',
    counterparty: 'ТОВ «Будівельний Об’єкт»',
    contractDate: '2026-02-10',
    expectedDeliveryDate: '2026-03-01',
    notes: 'Термінова закупівля для школи',
    items: [
      { name: 'Болт М8×40', unit: 'шт', quantity: 100, price: 2.5 },
      { name: 'Цемент ПЦ-500', unit: 'мішок', quantity: 20, price: 180 },
    ],
  })).expect(201)).body;
  await http.put(`/api/contracts/${a.id}/file`).attach('file', Buffer.from('pdf'), 'Скан договору 125.pdf').expect(200);
  await deliveryReq(http, a.id, [{ orderItemId: a.items[0].id, quantity: 40 }], 'НК-777', '2026-02-20')
    .attach('file', Buffer.from('x'), 'накладна-777.pdf').expect(201);

  b = (await http.post('/api/contracts').send(contract({
    number: 'ПС-7',
    counterparty: 'ПП Іваненко',
    contractDate: '2025-06-15',
    expectedDeliveryDate: null,
    items: [{ name: 'Фарба біла', unit: 'кг', quantity: 60, price: 95 }, { name: 'Пензель', unit: 'шт', quantity: 10 }],
  })).expect(201)).body;
  await http.put(`/api/contracts/${b.id}/shortfall`).send({
    expectedDeliveryDate: null,
    items: [{ orderItemId: b.items[1].id, cancelled: 10, cancelReason: 'Знято з виробництва' }],
  }).expect(200);
});
afterAll(() => t.close());

const list = async (query: Record<string, string>) =>
  (await t.admin.get('/api/contracts').query(query).expect(200)).body as Page<ContractSummary>;
const numbers = async (query: Record<string, string>) => (await list(query)).items.map((c) => c.number);

describe('нормалізація', () => {
  it('SQL search_norm() збігається з фронтовою searchNorm()', async () => {
    const samples = ['ТОВ «Будівельний Об’єкт»', 'Болт M8 / М8', 'ҐЄЇІ ґєїі Ёё', 'Café Ñandú', "об'єкт обʼєкт", 'ABC xyz 123'];
    for (const s of samples) {
      const [row] = await t.ds.query('SELECT search_norm($1) AS v', [s]);
      expect(row.v).toBe(searchNorm(s));
    }
  });

  it('підсвічування враховує нормалізацію', () => {
    expect(matchRanges('Болт M8×40', ['м8'])).toEqual([[5, 7]]);
    expect(matchRanges('Об’єкт', ['обєкт'])).toEqual([[0, 6]]);
  });
});

describe('список договорів: q (усі слова, будь-які поля)', () => {
  it('слова з різних полів і різних записів договору, у будь-якому порядку', async () => {
    expect(await numbers({ q: 'школи болт' })).toEqual(['Д-125/2026']);
    expect(await numbers({ q: 'іваненко фарба' })).toEqual(['ПС-7']);
    expect(await numbers({ q: 'фарба школи' })).toEqual([]);
  });

  it('латиниця/кирилиця, апострофи, і/ї, лапки', async () => {
    expect(await numbers({ q: 'M8' })).toEqual(['Д-125/2026']); // латинська M
    expect(await numbers({ q: 'обєкт' })).toEqual(['Д-125/2026']);
    expect(await numbers({ q: "об'єкт" })).toEqual(['Д-125/2026']);
    expect(await numbers({ q: 'будiвельний' })).toEqual(['Д-125/2026']); // латинська i
  });

  it('з одруківкою', async () => {
    expect(await numbers({ q: 'Іваненка' })).toEqual(['ПС-7']);
    expect(await numbers({ q: 'цемeнт' })).toEqual(['Д-125/2026']);
  });

  it('за накладною, файлом, причиною недопоставки, датою', async () => {
    expect(await numbers({ q: 'НК-777' })).toEqual(['Д-125/2026']);
    expect(await numbers({ q: 'накладна-777' })).toEqual(['Д-125/2026']);
    expect(await numbers({ q: 'виробництва' })).toEqual(['ПС-7']);
    expect(await numbers({ q: '20.02.2026' })).toEqual(['Д-125/2026']);
  });

  it('символи LIKE не працюють як шаблон', async () => {
    expect(await numbers({ q: '%' })).toEqual([]);
    expect(await numbers({ q: '_' })).toEqual([]);
  });
});

describe('список договорів: фільтри, сортування, сторінки', () => {
  it('комбінує фільтри', async () => {
    expect(await numbers({ hasFile: 'yes' })).toEqual(['Д-125/2026']);
    expect(await numbers({ hasFile: 'no' })).toEqual(['ПС-7']);
    expect(await numbers({ hasShortfall: 'yes' })).toEqual(['ПС-7']);
    expect(await numbers({ hasDeliveries: 'yes', status: 'overdue' })).toEqual(['Д-125/2026']);
    expect(await numbers({ status: 'waiting,overdue' })).toEqual(['Д-125/2026', 'ПС-7']);
    expect(await numbers({ deliveryFrom: '2026-02-01', deliveryTo: '2026-02-28' })).toEqual(['Д-125/2026']);
    expect(await numbers({ expectedFrom: '2026-01-01' })).toEqual(['Д-125/2026']);
    // Сума: Д-125 = 100×2.5 + 20×180 = 3850; ПС-7 = 60×95 = 5700
    expect(await numbers({ amountMin: '4000' })).toEqual(['ПС-7']);
    expect(await numbers({ amountMax: '4000', counterparty: 'будівельний' })).toEqual(['Д-125/2026']);
    expect(await numbers({ quantityMin: '100' })).toEqual(['Д-125/2026']);
    expect(await numbers({ dateFrom: '2025-01-01', dateTo: '2025-12-31', item: 'фарба' })).toEqual(['ПС-7']);
  });

  it('сортує і ділить на сторінки', async () => {
    expect(await numbers({ sort: 'amount', dir: 'desc' })).toEqual(['ПС-7', 'Д-125/2026']);
    expect(await numbers({ sort: 'number', dir: 'asc' })).toEqual(['Д-125/2026', 'ПС-7']);
    expect(await numbers({ sort: 'status' })).toEqual(['Д-125/2026', 'ПС-7']);
    const p2 = await list({ pageSize: '1', page: '2', sort: 'contractDate', dir: 'desc' });
    expect(p2).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(p2.items.map((c) => c.number)).toEqual(['ПС-7']);
    const beyond = await list({ pageSize: '1', page: '5' });
    expect(beyond).toMatchObject({ total: 2, items: [] });
  });

  it('повертає суми й агрегати поставок', async () => {
    const [c] = (await list({ number: 'Д-125' })).items;
    expect(c.totals).toMatchObject({ amount: 3850, receivedAmount: 100, quantity: 120, received: 40 });
    expect(c).toMatchObject({ hasFile: true, deliveriesCount: 1, lastDeliveryDate: '2026-02-20' });
  });

  it('відхиляє некоректні параметри', async () => {
    await t.admin.get('/api/contracts').query({ status: 'bad' }).expect(422);
    await t.admin.get('/api/contracts').query({ sort: 'id; drop table' }).expect(422);
  });
});

describe('глобальний пошук', () => {
  const search = async (q: string, extra: Record<string, string> = {}) =>
    (await t.admin.get('/api/search').query({ q, ...extra }).expect(200)).body as SearchResults;
  const group = (r: SearchResults, entity: string) => r.groups.find((g) => g.entity === entity)!;

  it('групує результати за сутностями', async () => {
    const r = await search('777');
    expect(group(r, 'delivery').hits.map((h) => h.title)).toEqual(['Накладна № НК-777']);
    expect(group(r, 'file').hits.map((h) => h.title)).toEqual(['накладна-777.pdf']);
    expect(group(r, 'delivery').hits[0].contractId).toBe(a.id);
  });

  it('найменування: слова з найменування і договору; хоча б одне — в найменуванні', async () => {
    const r = await search('болт д-125');
    expect(group(r, 'item').hits.map((h) => h.title)).toEqual(['Болт М8×40']);
    expect(group(r, 'contract').hits.map((h) => h.title)).toEqual(['№ Д-125/2026']);
    // Лише номер договору — найменування цього договору не вивалюються всі підряд
    expect(group(await search('Д-125'), 'item').total).toBe(0);
  });

  it('контрагенти й файли договору', async () => {
    const r = await search('іваненко');
    expect(group(r, 'counterparty').hits).toEqual([expect.objectContaining({ title: 'ПП Іваненко', subtitle: '1 договір' })]);
    expect(group(await search('скан 125'), 'file').hits[0]).toMatchObject({ title: 'Скан договору 125.pdf', contractId: a.id });
  });

  it('обмеження кількості і вибір груп', async () => {
    const r = await search('шт', { limit: '1', entities: 'item' });
    expect(r.groups.map((g) => g.entity)).toEqual(['item']);
    expect(r.groups[0].hits).toHaveLength(1);
    expect(r.groups[0].total).toBeGreaterThan(1);
    expect((await search('  ')).groups).toEqual([]);
  });

  it('пошук використовує триграмні індекси', async () => {
    const indexes = await t.ds.query("SELECT indexname FROM pg_indexes WHERE indexname LIKE '%trgm'");
    expect(indexes.length).toBeGreaterThanOrEqual(7);
  });
});
