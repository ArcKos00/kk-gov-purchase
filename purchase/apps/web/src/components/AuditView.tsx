import type { AuditAction, AuditChange, AuditEntity, AuditEntry } from '@kk-gov-purchase/shared';
import { fdate, fdatetime, ROLE_TEXT } from '../lib/format';

export const ACTION_TEXT: Record<AuditAction, string> = {
  insert: 'Створено',
  update: 'Змінено',
  delete: 'Видалено',
  login: 'Вхід',
  login_failed: 'Невдалий вхід',
  logout: 'Вихід',
};

export const ENTITY_TEXT: Record<AuditEntity, string> = {
  contracts: 'Договір',
  order_items: 'Найменування',
  deliveries: 'Поставка',
  delivery_lines: 'Рядок поставки',
  files: 'Файл',
  users: 'Користувач',
};

const FIELD_TEXT: Record<string, string> = {
  number: 'Номер', counterparty: 'Контрагент', contract_date: 'Дата договору', expected_delivery_date: 'Орієнт. дата поставки',
  notes: 'Примітки', file_id: 'Файл (id)', name: 'Найменування', unit: 'Од. виміру', quantity: 'Кількість', price: 'Ціна, ₴',
  cancelled_quantity: 'Не зможуть', cancel_reason: 'Причина недопоставки', date: 'Дата', invoice_number: 'Накладна',
  original_name: 'Назва файлу', content_type: 'Тип файлу', size: 'Розмір, Б', contract_id: 'Договір (id)',
  delivery_id: 'Поставка (id)', order_item_id: 'Найменування (id)', login: 'Логін', full_name: 'ПІБ', role: 'Роль',
  active: 'Активний', password_changed_at: 'Пароль змінено', reason: 'Причина',
};

const REASON_TEXT: Record<string, string> = {
  bad_password: 'невірний пароль',
  bad_password_locked: 'невірний пароль, обліковий запис заблоковано',
  unknown_login: 'невідомий логін',
  inactive: 'обліковий запис вимкнено',
  locked: 'обліковий запис заблоковано',
  ip_rate_limit: 'забагато спроб з цієї IP',
};

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'так' : 'ні';
  if (field === 'role' && typeof v === 'string') return ROLE_TEXT[v as keyof typeof ROLE_TEXT] ?? v;
  if (field === 'reason' && typeof v === 'string') return REASON_TEXT[v] ?? v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fdate(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fdatetime(v);
  if (typeof v === 'number') return v.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function ChangesTable({ entry }: { entry: AuditEntry }) {
  const changes = Object.entries(entry.changes ?? {}) as [string, AuditChange | unknown][];
  if (!changes.length) return null;
  // Для подій входу changes — це довільні деталі ({ reason })
  const isAuth = entry.entity === null;
  return (
    <table className="diff">
      <tbody>
        {changes.map(([field, c]) => {
          const ch = (isAuth ? { to: c } : c) as AuditChange;
          return (
            <tr key={field}>
              <th scope="row">{FIELD_TEXT[field] ?? field}</th>
              {entry.action === 'update' ? (
                <td><del>{show(field, ch.from)}</del> → <ins>{show(field, ch.to)}</ins></td>
              ) : (
                <td>{show(field, 'to' in ch ? ch.to : ch.from)}</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const who = (e: AuditEntry) => e.user?.fullName ?? (e.login ? e.login : 'система');

/** Історія змін, згрупована за запитами (одна дія користувача = одна група). */
export function HistoryTimeline({ entries }: { entries: AuditEntry[] }) {
  const groups: AuditEntry[][] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && e.requestId && last[0].requestId === e.requestId) last.push(e);
    else groups.push([e]);
  }
  return (
    <ol className="timeline">
      {groups.map((g) => (
        <li key={g[0].id}>
          <div className="tl-head">
            <span className="num small">{fdatetime(g[0].at)}</span> · <b>{who(g[0])}</b>
          </div>
          {[...g].reverse().map((e) => (
            <div key={e.id} className="tl-item">
              <span className={`pill act-${e.action}`}>{ACTION_TEXT[e.action]}</span>{' '}
              {e.entity && <span>{ENTITY_TEXT[e.entity] ?? e.entity}</span>}
              <ChangesTable entry={e} />
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}
