import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuditAction, AuditEntry, AuditQuery, Page } from '@order-tracking/shared';
import { AuditLog } from '../database/entities';
import { paging, Sql } from '../common/sql';
import { currentContext } from '../common/request-context';

export interface AuthEvent {
  action: Extract<AuditAction, 'login' | 'login_failed' | 'logout'>;
  userId?: number | null;
  login?: string | null;
  /** Причина невдалої спроби тощо */
  details?: Record<string, unknown>;
}

const SELECT = `
  SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.contract_id, a.login, a.ip, a.user_agent, a.request_id,
         a.changes, u.id AS u_id, u.login AS u_login, u.full_name AS u_full_name
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id`;

interface Row {
  id: string;
  at: Date;
  action: AuditAction;
  entity: AuditEntry['entity'];
  entity_id: string | null;
  contract_id: number | null;
  login: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  changes: AuditEntry['changes'];
  u_id: number | null;
  u_login: string | null;
  u_full_name: string | null;
}

const toEntry = (r: Row): AuditEntry => ({
  id: Number(r.id),
  at: r.at.toISOString(),
  action: r.action,
  entity: r.entity,
  entityId: r.entity_id === null ? null : Number(r.entity_id),
  contractId: r.contract_id,
  user: r.u_id ? { id: r.u_id, login: r.u_login!, fullName: r.u_full_name! } : null,
  login: r.login,
  ip: r.ip,
  userAgent: r.user_agent,
  requestId: r.request_id,
  changes: r.changes,
});

/**
 * Журнал дій. Зміни даних пише тригер у БД (див. міграцію Audit і AuditContextSubscriber),
 * а цей сервіс — події входу/виходу і читання журналу.
 */
@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async record(e: AuthEvent) {
    const ctx = currentContext();
    await this.ds.getRepository(AuditLog).insert({
      action: e.action,
      userId: e.userId ?? null,
      login: e.login ?? null,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      requestId: ctx?.requestId ?? null,
      changes: (e.details ?? null) as never,
    });
  }

  async list(q: AuditQuery): Promise<Page<AuditEntry>> {
    const sql = new Sql();
    if (q.userId) sql.and(`a.user_id = ${sql.p(Number(q.userId))}`);
    if (q.action) sql.and(`a.action = ANY(${sql.p(q.action.split(','))}::text[])`);
    if (q.entity) sql.and(`a.entity = ANY(${sql.p(q.entity.split(','))}::text[])`);
    if (q.contractId) sql.and(`a.contract_id = ${sql.p(Number(q.contractId))}`);
    // Межі дат — за київським часом, включно з усім днем "to".
    if (q.from) sql.and(`a.at >= (${sql.p(q.from)}::date)::timestamp AT TIME ZONE 'Europe/Kiev'`);
    if (q.to) sql.and(`a.at < (${sql.p(q.to)}::date + 1)::timestamp AT TIME ZONE 'Europe/Kiev'`);
    const { page, pageSize, offset } = paging(q.page, q.pageSize, 50, 500);
    const [rows, [{ total }]] = await Promise.all([
      this.ds.query(`${SELECT} ${sql.whereSql()} ORDER BY a.at DESC, a.id DESC LIMIT ${pageSize} OFFSET ${offset}`, sql.params),
      this.ds.query(`SELECT count(*) AS total FROM audit_log a ${sql.whereSql()}`, sql.params),
    ]);
    return { items: (rows as Row[]).map(toEntry), total: Number(total), page, pageSize };
  }

  /** Історія змін договору: сам договір, найменування, поставки, файли. */
  async contractHistory(contractId: number): Promise<AuditEntry[]> {
    const rows: Row[] = await this.ds.query(
      `${SELECT} WHERE a.contract_id = $1 ORDER BY a.at DESC, a.id DESC LIMIT 1000`,
      [contractId],
    );
    return rows.map(toEntry);
  }
}
