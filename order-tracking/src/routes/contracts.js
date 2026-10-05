import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { searchText, today, qty, STATUSES } from '../lib/format.js';
import { loadContract, searchContracts, counterparties } from '../lib/repo.js';
import { upload, saveFileRecord, removeStoredFile, discardUpload } from '../lib/storage.js';
import { str, isDate, parseQty, rows, MAX_QTY } from '../lib/validate.js';

export const router = Router();

const asId = (v) => (/^\d+$/.test(v) ? Number(v) : null);

// ---------- Перегляд і пошук ----------

router.get('/', async (req, res) => {
  const q = req.query;
  const filters = {
    number: str(q.number),
    counterparty: str(q.counterparty),
    item: str(q.item),
    dateFrom: isDate(q.dateFrom) ? q.dateFrom : '',
    dateTo: isDate(q.dateTo) ? q.dateTo : '',
    status: STATUSES[q.status] ? q.status : '',
  };
  const contracts = await searchContracts(filters, today());
  res.render('contracts/index', {
    title: 'Замовлення',
    filters,
    hasFilters: Object.values(filters).some(Boolean),
    itemFilter: searchText(filters.item),
    contracts,
  });
});

router.get('/new', async (req, res) => renderForm(res, emptyForm()));

router.get('/:id', async (req, res, next) => {
  const id = asId(req.params.id);
  const contract = id && (await loadContract({ query }, id, today()));
  if (!contract) return next();
  res.render('contracts/details', { title: `Договір № ${contract.number}`, contract });
});

// ---------- Створення / редагування ----------

function emptyForm() {
  return {
    number: '',
    counterparty: '',
    contract_date: today(),
    expected_delivery_date: '',
    notes: '',
    items: [{ name: '', unit: 'шт', quantity: '' }],
  };
}

async function renderForm(res, form, errors = {}, status = 200) {
  res.status(status).render('contracts/form', {
    title: form.id ? `Редагування договору № ${form.number}` : 'Нове замовлення',
    form,
    errors,
    counterparties: await counterparties(),
  });
}

/** Розбирає і перевіряє форму договору. `existing` — договір при редагуванні. */
async function readForm(body, existing) {
  const form = {
    id: existing?.id,
    number: str(body.number),
    counterparty: str(body.counterparty),
    contract_date: str(body.contract_date),
    expected_delivery_date: str(body.expected_delivery_date),
    notes: str(body.notes),
    remove_file: body.remove_file === '1',
    file_id: existing?.file_id,
    file_name: existing?.file_name,
    items: rows(body.items).map((r) => ({
      id: asId(str(r.id)),
      name: str(r.name),
      unit: str(r.unit) || 'шт',
      quantity: str(r.quantity),
    })),
  };
  const errors = {};

  if (!form.number) errors.number = 'Вкажіть номер договору';
  else if (form.number.length > 100) errors.number = 'Не довше 100 символів';
  if (!form.counterparty) errors.counterparty = 'Вкажіть контрагента';
  else if (form.counterparty.length > 300) errors.counterparty = 'Не довше 300 символів';
  if (!isDate(form.contract_date)) errors.contract_date = 'Вкажіть дату договору';
  if (form.expected_delivery_date) {
    if (!isDate(form.expected_delivery_date)) errors.expected_delivery_date = 'Некоректна дата';
    else if (isDate(form.contract_date) && form.expected_delivery_date < form.contract_date)
      errors.expected_delivery_date = 'Не може бути раніше дати договору';
  }
  if (form.items.length === 0) errors._ = 'Додайте хоча б одне найменування.';

  const existingItems = new Map((existing?.items ?? []).map((i) => [i.id, i]));
  form.items.forEach((row, idx) => {
    const qtyValue = parseQty(row.quantity);
    row.parsedQuantity = qtyValue;
    if (!row.name) errors[`items.${idx}.name`] = 'Вкажіть найменування';
    else if (row.name.length > 500) errors[`items.${idx}.name`] = 'Не довше 500 символів';
    if (row.unit.length > 20) errors[`items.${idx}.unit`] = 'Не довше 20 символів';
    if (qtyValue === null) errors[`items.${idx}.quantity`] = 'Вкажіть кількість';
    else if (Number.isNaN(qtyValue) || qtyValue <= 0 || qtyValue > MAX_QTY)
      errors[`items.${idx}.quantity`] = 'Кількість має бути більшою за 0';

    if (row.id) {
      const item = existingItems.get(row.id);
      if (!item) {
        errors._ = 'Найменування не належить цьому договору.';
        return;
      }
      row.received = item.received;
      const min = item.received + item.cancelled_quantity;
      if (!errors[`items.${idx}.quantity`] && qtyValue < min)
        errors[`items.${idx}.quantity`] =
          `Не менше ${qty(min)} (отримано ${qty(item.received)}, не зможуть ${qty(item.cancelled_quantity)})`;
    }
  });

  if (existing) {
    const kept = new Set(form.items.map((r) => r.id).filter(Boolean));
    for (const item of existing.items) {
      if (!kept.has(item.id) && item.received > 0)
        errors._ = `Не можна видалити «${item.name}»: по ньому вже є поставки.`;
    }
  }

  if (!errors.number && !errors.counterparty) {
    const { rowCount } = await query(
      `SELECT 1 FROM contracts WHERE number_search = $1 AND counterparty_search = $2 AND id <> $3`,
      [searchText(form.number), searchText(form.counterparty), existing?.id ?? 0],
    );
    if (rowCount) errors.number = 'Договір з таким номером у цього контрагента вже існує';
  }

  return { form, errors };
}

router.post('/', upload.single('file'), async (req, res) => {
  const { form, errors } = await readForm(req.body);
  if (Object.keys(errors).length) {
    discardUpload(req.file);
    return renderForm(res, form, errors, 422);
  }

  const id = await withTransaction(async (db) => {
    const fileId = await saveFileRecord(db, req.file);
    const { rows: [c] } = await db.query(
      `INSERT INTO contracts (number, counterparty, contract_date, expected_delivery_date, notes, file_id,
                              number_search, counterparty_search)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [form.number, form.counterparty, form.contract_date, form.expected_delivery_date || null,
        form.notes || null, fileId, searchText(form.number), searchText(form.counterparty)],
    );
    for (const item of form.items) {
      await db.query(
        `INSERT INTO order_items (contract_id, name, name_search, unit, quantity) VALUES ($1, $2, $3, $4, $5)`,
        [c.id, item.name, searchText(item.name), item.unit, item.parsedQuantity],
      );
    }
    return c.id;
  });

  req.flash(`Договір № ${form.number} створено.`);
  res.redirect(`/contracts/${id}`);
});

router.get('/:id/edit', async (req, res, next) => {
  const id = asId(req.params.id);
  const c = id && (await loadContract({ query }, id, today()));
  if (!c) return next();
  renderForm(res, {
    id: c.id,
    number: c.number,
    counterparty: c.counterparty,
    contract_date: c.contract_date,
    expected_delivery_date: c.expected_delivery_date ?? '',
    notes: c.notes ?? '',
    file_id: c.file_id,
    file_name: c.file_name,
    items: c.items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, quantity: i.quantity, received: i.received })),
  });
});

router.post('/:id/edit', upload.single('file'), async (req, res, next) => {
  const id = asId(req.params.id);
  let removedFile = null;
  const result = id && (await withTransaction(async (db) => {
    const existing = await loadContract(db, id, today(), { lock: true });
    if (!existing) return null;
    const { form, errors } = await readForm(req.body, existing);
    if (Object.keys(errors).length) return { form, errors };

    let fileId = existing.file_id;
    if (req.file) fileId = await saveFileRecord(db, req.file);
    else if (form.remove_file) fileId = null;

    await db.query(
      `UPDATE contracts SET number = $2, counterparty = $3, contract_date = $4, expected_delivery_date = $5,
              notes = $6, file_id = $7, number_search = $8, counterparty_search = $9
        WHERE id = $1`,
      [id, form.number, form.counterparty, form.contract_date, form.expected_delivery_date || null,
        form.notes || null, fileId, searchText(form.number), searchText(form.counterparty)],
    );

    const kept = form.items.map((r) => r.id).filter(Boolean);
    await db.query('DELETE FROM order_items WHERE contract_id = $1 AND NOT (id = ANY($2))', [id, kept]);
    for (const item of form.items) {
      if (item.id) {
        await db.query(
          'UPDATE order_items SET name = $2, name_search = $3, unit = $4, quantity = $5 WHERE id = $1',
          [item.id, item.name, searchText(item.name), item.unit, item.parsedQuantity],
        );
      } else {
        await db.query(
          'INSERT INTO order_items (contract_id, name, name_search, unit, quantity) VALUES ($1, $2, $3, $4, $5)',
          [id, item.name, searchText(item.name), item.unit, item.parsedQuantity],
        );
      }
    }

    if (existing.file_id && existing.file_id !== fileId) {
      const { rows: [f] } = await db.query('DELETE FROM files WHERE id = $1 RETURNING stored_name', [existing.file_id]);
      removedFile = f?.stored_name;
    }
    return { form };
  }));

  if (!result) {
    discardUpload(req.file);
    return next();
  }
  if (result.errors) {
    discardUpload(req.file);
    return renderForm(res, result.form, result.errors, 422);
  }
  if (removedFile) removeStoredFile(removedFile);
  req.flash('Зміни збережено.');
  res.redirect(`/contracts/${id}`);
});

router.post('/:id/delete', async (req, res, next) => {
  const id = asId(req.params.id);
  const deleted = id && (await withTransaction(async (db) => {
    const { rows: [c] } = await db.query('SELECT number, file_id FROM contracts WHERE id = $1 FOR UPDATE', [id]);
    if (!c) return null;
    const { rows: d } = await db.query(
      'SELECT file_id FROM deliveries WHERE contract_id = $1 AND file_id IS NOT NULL', [id]);
    const fileIds = [c.file_id, ...d.map((r) => r.file_id)].filter(Boolean);

    // Спершу поставки (рядки поставок посилаються на найменування), далі договір —
    // найменування видаляються каскадно.
    await db.query('DELETE FROM deliveries WHERE contract_id = $1', [id]);
    await db.query('DELETE FROM contracts WHERE id = $1', [id]);
    const { rows: files } = await db.query('DELETE FROM files WHERE id = ANY($1) RETURNING stored_name', [fileIds]);
    return { number: c.number, files };
  }));
  if (!deleted) return next();
  deleted.files.forEach((f) => removeStoredFile(f.stored_name));
  req.flash(`Договір № ${deleted.number} видалено.`);
  res.redirect('/contracts');
});

// ---------- Недопоставка / орієнтовна дата ----------

router.get('/:id/update', async (req, res, next) => {
  const id = asId(req.params.id);
  const contract = id && (await loadContract({ query }, id, today()));
  if (!contract) return next();
  res.render('contracts/update', {
    title: `Стан договору № ${contract.number}`,
    contract,
    form: {
      expected_delivery_date: contract.expected_delivery_date ?? '',
      rows: contract.items.map((i) => ({ id: i.id, cancelled: i.cancelled_quantity, reason: i.cancel_reason ?? '' })),
    },
    errors: {},
  });
});

router.post('/:id/update', async (req, res, next) => {
  const id = asId(req.params.id);
  const result = id && (await withTransaction(async (db) => {
    const contract = await loadContract(db, id, today(), { lock: true });
    if (!contract) return null;

    const form = {
      expected_delivery_date: str(req.body.expected_delivery_date),
      rows: rows(req.body.rows).map((r) => ({ id: asId(str(r.id)), cancelled: str(r.cancelled), reason: str(r.reason) })),
    };
    const errors = {};
    if (form.expected_delivery_date && !isDate(form.expected_delivery_date))
      errors.expected_delivery_date = 'Некоректна дата';

    const items = new Map(contract.items.map((i) => [i.id, i]));
    form.rows.forEach((row, idx) => {
      const item = items.get(row.id);
      if (!item) {
        errors._ = 'Найменування не належить цьому договору.';
        return;
      }
      const v = parseQty(row.cancelled) ?? 0;
      row.parsed = v;
      const max = Math.max(0, item.quantity - item.received);
      if (Number.isNaN(v)) errors[`rows.${idx}`] = 'Некоректна кількість';
      else if (v > max) errors[`rows.${idx}`] = `Не більше ${qty(max)}`;
      if (row.reason.length > 1000) errors[`rows.${idx}`] = 'Причина — не довше 1000 символів';
    });
    if (Object.keys(errors).length) return { contract, form, errors };

    await db.query('UPDATE contracts SET expected_delivery_date = $2 WHERE id = $1', [id, form.expected_delivery_date || null]);
    for (const row of form.rows) {
      await db.query('UPDATE order_items SET cancelled_quantity = $2, cancel_reason = $3 WHERE id = $1', [
        row.id, row.parsed, row.parsed > 0 ? row.reason || null : null,
      ]);
    }
    return { ok: true };
  }));

  if (!result) return next();
  if (result.errors) {
    return res.status(422).render('contracts/update', {
      title: `Стан договору № ${result.contract.number}`,
      ...result,
    });
  }
  req.flash('Стан договору оновлено.');
  res.redirect(`/contracts/${id}`);
});
