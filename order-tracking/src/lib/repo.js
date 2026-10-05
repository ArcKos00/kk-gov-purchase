import { query } from '../db.js';
import { searchText } from './format.js';

const round3 = (n) => Math.round(n * 1000) / 1000;

function withTotals(item) {
  const received = Number(item.received ?? 0);
  return {
    ...item,
    received,
    pending: Math.max(0, round3(item.quantity - received - item.cancelled_quantity)),
  };
}

/** Найменування з порахованими "отримано" і "очікуємо" для переліку договорів. */
export async function loadItems(db, contractIds) {
  if (contractIds.length === 0) return [];
  const { rows } = await db.query(
    `SELECT i.*, COALESCE(SUM(l.quantity), 0) AS received
       FROM order_items i
       LEFT JOIN delivery_lines l ON l.order_item_id = i.id
      WHERE i.contract_id = ANY($1)
      GROUP BY i.id
      ORDER BY i.id`,
    [contractIds],
  );
  return rows.map(withTotals);
}

export function contractStatus(contract, today) {
  const pending = contract.items.reduce((s, i) => s + i.pending, 0);
  if (contract.items.length === 0 || pending <= 0) return 'completed';
  if (contract.expected_delivery_date && contract.expected_delivery_date < today) return 'overdue';
  return contract.items.some((i) => i.received > 0) ? 'partial' : 'waiting';
}

function attachTotals(contract, items, today) {
  contract.items = items;
  contract.total = round3(items.reduce((s, i) => s + i.quantity, 0));
  contract.received = round3(items.reduce((s, i) => s + i.received, 0));
  contract.cancelled = round3(items.reduce((s, i) => s + i.cancelled_quantity, 0));
  contract.pending = round3(items.reduce((s, i) => s + i.pending, 0));
  contract.status = contractStatus(contract, today);
  return contract;
}

/**
 * Договір з найменуваннями, поставками і файлами.
 * `db` — пул або клієнт транзакції; `lock` блокує рядок договору (FOR UPDATE).
 */
export async function loadContract(db, id, today, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT c.*, f.original_name AS file_name, f.size AS file_size
       FROM contracts c LEFT JOIN files f ON f.id = c.file_id
      WHERE c.id = $1 ${lock ? 'FOR UPDATE OF c' : ''}`,
    [id],
  );
  const contract = rows[0];
  if (!contract) return null;

  const items = await loadItems(db, [contract.id]);
  attachTotals(contract, items, today);

  const deliveries = await db.query(
    `SELECT d.*, f.original_name AS file_name
       FROM deliveries d LEFT JOIN files f ON f.id = d.file_id
      WHERE d.contract_id = $1
      ORDER BY d.date DESC, d.id DESC`,
    [contract.id],
  );
  const lines = await db.query(
    `SELECT l.* FROM delivery_lines l JOIN deliveries d ON d.id = l.delivery_id
      WHERE d.contract_id = $1 ORDER BY l.id`,
    [contract.id],
  );
  const itemsById = new Map(items.map((i) => [i.id, i]));
  contract.deliveries = deliveries.rows.map((d) => ({
    ...d,
    lines: lines.rows.filter((l) => l.delivery_id === d.id).map((l) => ({ ...l, item: itemsById.get(l.order_item_id) })),
  }));
  return contract;
}

export async function searchContracts(filters, today) {
  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.number) add('c.number_search LIKE ?', `%${escapeLike(searchText(filters.number))}%`);
  if (filters.counterparty) add('c.counterparty_search LIKE ?', `%${escapeLike(searchText(filters.counterparty))}%`);
  if (filters.item) {
    add(
      'EXISTS (SELECT 1 FROM order_items i WHERE i.contract_id = c.id AND i.name_search LIKE ?)',
      `%${escapeLike(searchText(filters.item))}%`,
    );
  }
  if (filters.dateFrom) add('c.contract_date >= ?', filters.dateFrom);
  if (filters.dateTo) add('c.contract_date <= ?', filters.dateTo);

  const { rows } = await query(
    `SELECT c.* FROM contracts c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.contract_date DESC, c.id DESC`,
    params,
  );

  const items = await loadItems({ query }, rows.map((c) => c.id));
  let contracts = rows.map((c) => attachTotals(c, items.filter((i) => i.contract_id === c.id), today));
  if (filters.status) contracts = contracts.filter((c) => c.status === filters.status);
  return contracts;
}

export async function counterparties() {
  const { rows } = await query('SELECT DISTINCT counterparty FROM contracts ORDER BY counterparty');
  return rows.map((r) => r.counterparty);
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
