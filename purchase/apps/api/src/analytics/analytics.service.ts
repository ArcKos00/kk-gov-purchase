import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type {
  AnalyticsDashboard, AnalyticsQuery, ContractStatus, CounterpartyStat, Granularity, ItemStat, Kpis, OverdueContract,
  PeriodStat, StatusStat, Timeliness,
} from '@kk-gov-purchase/shared';
import { isoDate, n, nOrNull } from '../common/sql';
import { today } from '../common/text';
import { SET_SIMILARITY } from '../common/text-query';
import { ContractQuery, STATUSES } from '../contracts/contract-query';

const r2 = (v: unknown) => Math.round(n(v) * 100) / 100;
const r3 = (v: unknown) => Math.round(n(v) * 1000) / 1000;

/**
 * Аналітика. Усі агрегати рахує Postgres; набір договорів визначає той самий фільтр,
 * що й у списку договорів (ContractQuery), тож цифри збігаються зі списком.
 * Фільтрований набір матеріалізується в тимчасову таблицю на час транзакції.
 */
@Injectable()
export class AnalyticsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async dashboard(f: AnalyticsQuery): Promise<AnalyticsDashboard> {
    const query = new ContractQuery(f, today());
    const granularity: Granularity = f.granularity ?? 'month';
    return this.ds.transaction(async (em) => {
      await em.query(SET_SIMILARITY);
      await em.query(
        `CREATE TEMP TABLE fc ON COMMIT DROP AS
         SELECT c.id, c.number, c.counterparty, c.contract_date, c.expected_delivery_date,
                ${query.status} AS status, ${query.today} AS today,
                s.quantity, s.received, s.cancelled, s.pending,
                coalesce(s.amount, 0) AS amount, coalesce(s.received_amount, 0) AS received_amount,
                coalesce(s.pending_amount, 0) AS pending_amount, coalesce(s.cancelled_amount, 0) AS cancelled_amount
           FROM ${query.from} ${query.where()}`,
        query.sql.params,
      );
      await em.query('CREATE INDEX ON fc (id)');
      return {
        kpis: await this.kpis(em),
        byStatus: await this.byStatus(em),
        byCounterparty: await this.byCounterparty(em),
        byPeriod: await this.byPeriod(em, granularity),
        topItems: await this.topItems(em),
        timeliness: await this.timeliness(em),
      };
    });
  }

  /** Поставки договорів набору: дата, кількість і сума, чи вчасно (не пізніше орієнтовної дати). */
  private static readonly DELIVERIES = `
    SELECT d.id, d.date, fc.expected_delivery_date,
           (SELECT coalesce(sum(l.quantity), 0) FROM delivery_lines l WHERE l.delivery_id = d.id) AS quantity,
           (SELECT coalesce(sum(l.quantity * i.price), 0) FROM delivery_lines l JOIN order_items i ON i.id = l.order_item_id
             WHERE l.delivery_id = d.id) AS amount
      FROM deliveries d JOIN fc ON fc.id = d.contract_id`;

  private async kpis(em: EntityManager): Promise<Kpis> {
    const [k] = await em.query(`
      SELECT count(*) AS contracts, sum(amount) AS amount, sum(received_amount) AS received_amount,
             sum(pending_amount) AS pending_amount, sum(cancelled_amount) AS cancelled_amount,
             sum(quantity) AS quantity, sum(received) AS received, sum(pending) AS pending, sum(cancelled) AS cancelled,
             count(*) FILTER (WHERE status = 'overdue') AS overdue,
             sum(pending_amount) FILTER (WHERE status = 'overdue') AS overdue_amount,
             count(*) FILTER (WHERE cancelled > 0) AS with_shortfall,
             count(*) FILTER (WHERE status = 'completed') AS completed,
             count(DISTINCT search_norm(counterparty)) AS counterparties
        FROM fc`);
    const [d] = await em.query(`
      SELECT count(*) AS deliveries,
             count(*) FILTER (WHERE expected_delivery_date IS NOT NULL AND date <= expected_delivery_date) AS on_time,
             count(*) FILTER (WHERE expected_delivery_date IS NOT NULL) AS with_deadline
        FROM (${AnalyticsService.DELIVERIES}) x`);
    const quantity = n(k.quantity);
    return {
      contracts: n(k.contracts),
      amount: r2(k.amount),
      receivedAmount: r2(k.received_amount),
      pendingAmount: r2(k.pending_amount),
      cancelledAmount: r2(k.cancelled_amount),
      quantity: r3(k.quantity),
      received: r3(k.received),
      pending: r3(k.pending),
      cancelled: r3(k.cancelled),
      receivedShare: quantity > 0 ? n(k.received) / quantity : 0,
      overdue: n(k.overdue),
      overdueAmount: r2(k.overdue_amount),
      withShortfall: n(k.with_shortfall),
      completed: n(k.completed),
      deliveries: n(d.deliveries),
      onTimeShare: n(d.with_deadline) > 0 ? n(d.on_time) / n(d.with_deadline) : null,
      counterparties: n(k.counterparties),
    };
  }

  private async byStatus(em: EntityManager): Promise<StatusStat[]> {
    const rows: { status: ContractStatus; contracts: string; amount: string; pending: string }[] = await em.query(`
      SELECT status, count(*) AS contracts, sum(amount) AS amount, sum(pending) AS pending FROM fc GROUP BY status`);
    const by = new Map(rows.map((r) => [r.status, r]));
    return STATUSES.map((status) => ({
      status,
      contracts: n(by.get(status)?.contracts),
      amount: r2(by.get(status)?.amount),
      pending: r3(by.get(status)?.pending),
    }));
  }

  private async byCounterparty(em: EntityManager): Promise<CounterpartyStat[]> {
    const rows = await em.query(`
      SELECT min(counterparty) AS counterparty, count(*) AS contracts,
             sum(amount) AS amount, sum(received_amount) AS received_amount, sum(pending_amount) AS pending_amount,
             sum(quantity) AS quantity, sum(received) AS received, sum(pending) AS pending, sum(cancelled) AS cancelled,
             count(*) FILTER (WHERE status = 'overdue') AS overdue
        FROM fc GROUP BY search_norm(counterparty)
       ORDER BY sum(amount) DESC, count(*) DESC, min(counterparty)
       LIMIT 100`);
    return rows.map((r: Record<string, unknown>) => ({
      counterparty: String(r.counterparty),
      contracts: n(r.contracts),
      amount: r2(r.amount),
      receivedAmount: r2(r.received_amount),
      pendingAmount: r2(r.pending_amount),
      quantity: r3(r.quantity),
      received: r3(r.received),
      pending: r3(r.pending),
      cancelled: r3(r.cancelled),
      overdue: n(r.overdue),
    }));
  }

  private async byPeriod(em: EntityManager, g: Granularity): Promise<PeriodStat[]> {
    const rows = await em.query(`
      WITH c AS (
        SELECT date_trunc('${g}', contract_date)::date AS period, count(*) AS contracts, sum(amount) AS amount
          FROM fc GROUP BY 1
      ), d AS (
        SELECT date_trunc('${g}', date)::date AS period, count(*) AS deliveries, sum(quantity) AS quantity, sum(amount) AS amount,
               count(*) FILTER (WHERE expected_delivery_date IS NOT NULL AND date <= expected_delivery_date) AS on_time,
               count(*) FILTER (WHERE expected_delivery_date IS NOT NULL AND date > expected_delivery_date) AS late
          FROM (${AnalyticsService.DELIVERIES}) x GROUP BY 1
      )
      SELECT coalesce(c.period, d.period)::text AS period, c.contracts, c.amount, d.deliveries,
             d.quantity AS received_quantity, d.amount AS received_amount, d.on_time, d.late
        FROM c FULL JOIN d ON d.period = c.period
       ORDER BY 1`);
    return rows.map((r: Record<string, unknown>) => ({
      period: isoDate(r.period)!,
      contracts: n(r.contracts),
      amount: r2(r.amount),
      deliveries: n(r.deliveries),
      receivedQuantity: r3(r.received_quantity),
      receivedAmount: r2(r.received_amount),
      onTime: n(r.on_time),
      late: n(r.late),
    }));
  }

  private async topItems(em: EntityManager): Promise<ItemStat[]> {
    const rows = await em.query(`
      SELECT min(i.name) AS name, min(i.unit) AS unit, count(DISTINCT i.contract_id) AS contracts,
             sum(i.quantity) AS quantity, sum(coalesce(r.received, 0)) AS received, sum(i.cancelled_quantity) AS cancelled,
             sum(greatest(i.quantity - coalesce(r.received, 0) - i.cancelled_quantity, 0)) AS pending,
             coalesce(sum(i.quantity * i.price), 0) AS amount
        FROM order_items i
        JOIN fc ON fc.id = i.contract_id
        LEFT JOIN LATERAL (SELECT sum(l.quantity) AS received FROM delivery_lines l WHERE l.order_item_id = i.id) r ON true
       GROUP BY search_norm(i.name), search_norm(i.unit)
       ORDER BY 8 DESC, 4 DESC, 1
       LIMIT 20`);
    return rows.map((r: Record<string, unknown>) => ({
      name: String(r.name),
      unit: String(r.unit),
      contracts: n(r.contracts),
      quantity: r3(r.quantity),
      received: r3(r.received),
      cancelled: r3(r.cancelled),
      pending: r3(r.pending),
      amount: r2(r.amount),
    }));
  }

  private async timeliness(em: EntityManager): Promise<Timeliness> {
    const [t] = await em.query(`
      SELECT count(*) AS deliveries,
             count(*) FILTER (WHERE expected_delivery_date IS NOT NULL AND date <= expected_delivery_date) AS on_time,
             count(*) FILTER (WHERE expected_delivery_date IS NOT NULL AND date > expected_delivery_date) AS late,
             count(*) FILTER (WHERE expected_delivery_date IS NULL) AS no_deadline,
             avg(date - expected_delivery_date) FILTER (WHERE date > expected_delivery_date) AS avg_delay
        FROM (${AnalyticsService.DELIVERIES}) x`);
    const overdue = await em.query(`
      SELECT id, number, counterparty, expected_delivery_date::text AS expected, (today - expected_delivery_date) AS days,
             pending, pending_amount
        FROM fc WHERE status = 'overdue'
       ORDER BY days DESC, pending_amount DESC
       LIMIT 20`);
    const avg = nOrNull(t.avg_delay);
    return {
      deliveries: n(t.deliveries),
      onTime: n(t.on_time),
      late: n(t.late),
      noDeadline: n(t.no_deadline),
      avgDelayDays: avg === null ? null : Math.round(avg * 10) / 10,
      overdueContracts: overdue.map((r: Record<string, unknown>): OverdueContract => ({
        id: n(r.id),
        number: String(r.number),
        counterparty: String(r.counterparty),
        expectedDeliveryDate: isoDate(r.expected)!,
        daysOverdue: n(r.days),
        pending: r3(r.pending),
        pendingAmount: r2(r.pending_amount),
      })),
    };
  }
}
