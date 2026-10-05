import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { today, qty } from '../lib/format.js';
import { loadContract } from '../lib/repo.js';
import { upload, saveFileRecord, removeStoredFile, discardUpload } from '../lib/storage.js';
import { str, isDate, parseQty, rows } from '../lib/validate.js';

export const router = Router();

const asId = (v) => (/^\d+$/.test(v) ? Number(v) : null);

function render(res, contract, form, errors = {}, status = 200) {
  res.status(status).render('deliveries/new', {
    title: `Поставка по договору № ${contract.number}`,
    contract,
    form,
    errors,
  });
}

router.get('/contracts/:id/deliveries/new', async (req, res, next) => {
  const id = asId(req.params.id);
  const contract = id && (await loadContract({ query }, id, today()));
  if (!contract) return next();
  render(res, contract, { date: today(), invoice_number: '', notes: '', lines: {} });
});

router.post('/contracts/:id/deliveries', upload.single('file'), async (req, res, next) => {
  const id = asId(req.params.id);
  const result = id && (await withTransaction(async (db) => {
    // Блокуємо договір, щоб дві одночасні поставки не перевищили "очікуємо".
    const contract = await loadContract(db, id, today(), { lock: true });
    if (!contract) return null;

    const form = {
      date: str(req.body.date),
      invoice_number: str(req.body.invoice_number),
      notes: str(req.body.notes),
      lines: {},
    };
    const errors = {};
    if (!isDate(form.date)) errors.date = 'Вкажіть дату поставки';
    if (!form.invoice_number) errors.invoice_number = 'Вкажіть номер накладної';
    else if (form.invoice_number.length > 100) errors.invoice_number = 'Не довше 100 символів';

    const items = new Map(contract.items.map((i) => [i.id, i]));
    const toInsert = [];
    for (const line of rows(req.body.lines)) {
      const item = items.get(asId(str(line.item_id)));
      if (!item) {
        errors._ = 'Найменування не належить цьому договору.';
        continue;
      }
      form.lines[item.id] = str(line.quantity);
      const v = parseQty(line.quantity);
      if (v === null || v === 0) continue;
      if (Number.isNaN(v)) errors[`line.${item.id}`] = 'Некоректна кількість';
      else if (v > item.pending) errors[`line.${item.id}`] = `Очікується лише ${qty(item.pending)}`;
      else toInsert.push({ itemId: item.id, quantity: v });
    }
    if (toInsert.length === 0 && !Object.keys(errors).some((k) => k.startsWith('line.')))
      errors._ = 'Вкажіть кількість хоча б по одному найменуванню.';
    if (Object.keys(errors).length) return { contract, form, errors };

    const fileId = await saveFileRecord(db, req.file);
    const { rows: [d] } = await db.query(
      `INSERT INTO deliveries (contract_id, date, invoice_number, file_id, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, form.date, form.invoice_number, fileId, form.notes || null],
    );
    for (const line of toInsert) {
      await db.query('INSERT INTO delivery_lines (delivery_id, order_item_id, quantity) VALUES ($1, $2, $3)', [
        d.id, line.itemId, line.quantity,
      ]);
    }
    return { invoice: form.invoice_number };
  }));

  if (!result) {
    discardUpload(req.file);
    return next();
  }
  if (result.errors) {
    discardUpload(req.file);
    return render(res, result.contract, result.form, result.errors, 422);
  }
  req.flash(`Поставку за накладною № ${result.invoice} додано.`);
  res.redirect(`/contracts/${id}`);
});

router.post('/deliveries/:id/delete', async (req, res, next) => {
  const id = asId(req.params.id);
  const deleted = id && (await withTransaction(async (db) => {
    const { rows: [d] } = await db.query(
      'DELETE FROM deliveries WHERE id = $1 RETURNING contract_id, invoice_number, file_id', [id]);
    if (!d) return null;
    const { rows: [f] } = await db.query('DELETE FROM files WHERE id = $1 RETURNING stored_name', [d.file_id ?? 0]);
    return { ...d, stored_name: f?.stored_name };
  }));
  if (!deleted) return next();
  if (deleted.stored_name) removeStoredFile(deleted.stored_name);
  req.flash(`Поставку за накладною № ${deleted.invoice_number} видалено.`);
  res.redirect(`/contracts/${deleted.contract_id}`);
});
