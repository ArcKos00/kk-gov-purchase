import type { ContractFilter, ContractSort, ContractStatus, SortDir } from '@order-tracking/shared';
import { Sql } from '../common/sql';
import { TextQuery } from '../common/text-query';

export const STATUSES: ContractStatus[] = ['waiting', 'partial', 'overdue', 'completed'];

/**
 * Агрегати договору `c` одним проходом (LATERAL — використовує індекси за contract_id / order_item_id):
 *   s.items_count, s.quantity, s.received, s.cancelled, s.pending, s.amount, s.received_amount,
 *   s.cancelled_amount, s.pending_amount, ds.deliveries_count, ds.last_delivery_date.
 * Суми (amount) — лише за найменуваннями з ціною; NULL, якщо цін немає зовсім.
 */
export const STATS_JOIN = `
  CROSS JOIN LATERAL (
    SELECT count(i.id)::int AS items_count,
           coalesce(sum(i.quantity), 0) AS quantity,
           coalesce(sum(r.received), 0) AS received,
           coalesce(sum(i.cancelled_quantity), 0) AS cancelled,
           coalesce(sum(greatest(i.quantity - coalesce(r.received, 0) - i.cancelled_quantity, 0)), 0) AS pending,
           sum(i.quantity * i.price) AS amount,
           sum(coalesce(r.received, 0) * i.price) AS received_amount,
           sum(i.cancelled_quantity * i.price) AS cancelled_amount,
           sum(greatest(i.quantity - coalesce(r.received, 0) - i.cancelled_quantity, 0) * i.price) AS pending_amount
      FROM order_items i
      LEFT JOIN LATERAL (SELECT sum(l.quantity) AS received FROM delivery_lines l WHERE l.order_item_id = i.id) r ON true
     WHERE i.contract_id = c.id
  ) s
  CROSS JOIN LATERAL (
    SELECT count(*)::int AS deliveries_count, max(d.date) AS last_delivery_date
      FROM deliveries d WHERE d.contract_id = c.id
  ) ds`;

/** Стан договору — та сама логіка, що statusOf() у contract-view.ts. */
export const statusExpr = (today: string) => `(CASE
  WHEN s.items_count = 0 OR s.pending <= 0 THEN 'completed'
  WHEN c.expected_delivery_date < ${today} THEN 'overdue'
  WHEN s.received > 0 THEN 'partial'
  ELSE 'waiting' END)`;

const SORT_SQL: Record<Exclude<ContractSort, 'relevance' | 'status'>, string> = {
  contractDate: 'c.contract_date',
  number: 'c.number_search',
  counterparty: 'c.counterparty_search',
  expectedDeliveryDate: 'c.expected_delivery_date',
  quantity: 's.quantity',
  pending: 's.pending',
  amount: 's.amount',
  progress: "(CASE WHEN s.quantity > 0 THEN s.received / s.quantity ELSE 1 END)",
  lastDeliveryDate: 'ds.last_delivery_date',
};

export const parseStatuses = (s?: string): ContractStatus[] =>
  (s ?? '').split(',').map((x) => x.trim()).filter((x): x is ContractStatus => STATUSES.includes(x as ContractStatus));

/**
 * Набір договорів за фільтром. Спільний для списку договорів і аналітики.
 * Дає FROM (договір + агрегати), WHERE і вирази стану та релевантності.
 */
export class ContractQuery {
  readonly sql = new Sql();
  readonly text: TextQuery;
  readonly today: string;
  readonly from = `contracts c ${STATS_JOIN}`;
  readonly status: string;

  constructor(f: ContractFilter, today: string) {
    const sql = this.sql;
    // Дата генерується сервером (YYYY-MM-DD) — підставляємо літералом, щоб не лишати невикористаний параметр.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`Bad date ${today}`);
    this.today = `'${today}'::date`;
    this.status = statusExpr(this.today);
    this.text = new TextQuery(sql, f.q);
    for (const cond of this.text.contractConditions('c')) sql.and(cond);

    const contains = (expr: string, v?: string) => {
      if (v?.trim()) sql.and(`search_norm(${expr}) LIKE '%' || search_norm(${sql.p(v.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`))}) || '%'`);
    };
    contains('c.number', f.number);
    contains('c.counterparty', f.counterparty);
    if (f.item?.trim()) {
      sql.and(`EXISTS (SELECT 1 FROM order_items fi WHERE fi.contract_id = c.id
        AND search_norm(fi.name) LIKE '%' || search_norm(${sql.p(f.item.trim().replace(/[\\%_]/g, (ch) => `\\${ch}`))}) || '%')`);
    }

    const range = (expr: string, from?: string, to?: string, cast = '::date') => {
      if (from) sql.and(`${expr} >= ${sql.p(from)}${cast}`);
      if (to) sql.and(`${expr} <= ${sql.p(to)}${cast}`);
    };
    range('c.contract_date', f.dateFrom, f.dateTo);
    range('c.expected_delivery_date', f.expectedFrom, f.expectedTo);
    if (f.deliveryFrom || f.deliveryTo) {
      const parts = ['fd.contract_id = c.id'];
      if (f.deliveryFrom) parts.push(`fd.date >= ${sql.p(f.deliveryFrom)}::date`);
      if (f.deliveryTo) parts.push(`fd.date <= ${sql.p(f.deliveryTo)}::date`);
      sql.and(`EXISTS (SELECT 1 FROM deliveries fd WHERE ${parts.join(' AND ')})`);
    }
    range('s.amount', f.amountMin, f.amountMax, '::numeric');
    range('s.quantity', f.quantityMin, f.quantityMax, '::numeric');

    const statuses = parseStatuses(f.status);
    if (statuses.length && statuses.length < STATUSES.length) sql.and(`${this.status} = ANY(${sql.p(statuses)}::text[])`);

    const yesNo = (v: string | undefined, yes: string) => {
      if (v === 'yes') sql.and(yes);
      else if (v === 'no') sql.and(`NOT (${yes})`);
    };
    yesNo(f.hasFile, 'c.file_id IS NOT NULL');
    yesNo(f.hasShortfall, 's.cancelled > 0');
    yesNo(f.hasDeliveries, 'ds.deliveries_count > 0');
  }

  where() {
    return this.sql.whereSql();
  }

  /** ORDER BY для списку. За замовчуванням — релевантність (якщо є запит), інакше дата договору. */
  orderBy(sort?: ContractSort, dir?: SortDir): string {
    const s = sort ?? (this.text.empty ? 'contractDate' : 'relevance');
    if (s === 'relevance') {
      return this.text.empty
        ? 'c.contract_date DESC, c.id DESC'
        : `score DESC, c.contract_date DESC, c.id DESC`;
    }
    const d = (dir ?? (['number', 'counterparty', 'status'].includes(s) ? 'asc' : 'desc')) === 'asc' ? 'ASC' : 'DESC';
    const expr = s === 'status' ? `array_position(ARRAY['overdue','waiting','partial','completed'], ${this.status})` : SORT_SQL[s];
    return `${expr} ${d} NULLS LAST, c.id ${d}`;
  }
}
