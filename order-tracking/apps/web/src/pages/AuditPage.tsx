import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { AuditAction, AuditEntity, AuditQuery } from '@order-tracking/shared';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { fdatetime } from '../lib/format';
import { compact, useUrlState } from '../lib/url-state';
import { ACTION_TEXT, ChangesTable, ENTITY_TEXT, who } from '../components/AuditView';
import { Empty, LoadError, Loading, PageHead, Pagination, Spinner } from '../components/ui';

const KEYS = ['userId', 'action', 'entity', 'contractId', 'from', 'to', 'page'] as const;

/** Журнал дій (адміністратор): входи, виходи і всі зміни даних з різницею «було → стало». */
export function AuditPage() {
  const { values, set, reset } = useUrlState(KEYS);
  const query = compact(values) as AuditQuery;
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const users = useQuery({ queryKey: ['users'], queryFn: api.users });
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['audit', query],
    queryFn: () => api.audit(query),
    placeholderData: keepPreviousData,
  });
  const setF = (k: (typeof KEYS)[number]) => (e: { target: { value: string } }) => set({ [k]: e.target.value, page: '' });
  const toggle = (id: number) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };
  const hasFilters = KEYS.some((k) => k !== 'page' && values[k]);

  return (
    <>
      <PageHead title="Журнал дій" subtitle="Хто, коли і що змінив; входи в систему"
        actions={data && data.items.length > 0 && (
          <button type="button" className="btn sm" onClick={() => downloadCsv('журнал-дій', ['Час', 'Користувач', 'Дія', 'Об’єкт', 'id', 'Договір', 'IP', 'Зміни'],
            data.items.map((e) => [fdatetime(e.at), who(e), ACTION_TEXT[e.action], e.entity ? ENTITY_TEXT[e.entity] : '', e.entityId, e.contractId, e.ip, JSON.stringify(e.changes ?? {})]))}>
            ⇩ CSV (сторінка)
          </button>
        )} />

      <div className="panel panel-b grid">
        <label className="f">Користувач
          <select value={values.userId} onChange={setF('userId')}>
            <option value="">усі</option>
            {users.data?.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.login})</option>)}
          </select>
        </label>
        <label className="f">Дія
          <select value={values.action} onChange={setF('action')}>
            <option value="">усі</option>
            <option value="insert,update,delete">усі зміни даних</option>
            <option value="login,login_failed,logout">усі входи/виходи</option>
            {(Object.keys(ACTION_TEXT) as AuditAction[]).map((a) => <option key={a} value={a}>{ACTION_TEXT[a]}</option>)}
          </select>
        </label>
        <label className="f">Об’єкт
          <select value={values.entity} onChange={setF('entity')}>
            <option value="">усі</option>
            {(Object.keys(ENTITY_TEXT) as AuditEntity[]).map((e) => <option key={e} value={e}>{ENTITY_TEXT[e]}</option>)}
          </select>
        </label>
        <label className="f">Договір (id)<input inputMode="numeric" value={values.contractId} onChange={(e) => set({ contractId: e.target.value.replace(/\D/g, ''), page: '' })} /></label>
        <label className="f">З дати<input type="date" value={values.from} onChange={setF('from')} /></label>
        <label className="f">По дату<input type="date" value={values.to} onChange={setF('to')} /></label>
        {hasFilters && <div className="f" style={{ alignSelf: 'end' }}><button type="button" className="btn" onClick={() => reset()}>Скинути</button></div>}
      </div>

      {isPending ? <Loading /> : error ? <LoadError error={error} onRetry={() => void refetch()} /> : data.total === 0 ? <Empty>Записів немає.</Empty> : (
        <>
          <div className="small muted">Записів: {data.total} {isFetching && <Spinner />}</div>
          <div className="panel tbl-box">
            <table className="audit-tbl">
              <thead><tr><th>Час</th><th>Користувач</th><th>Дія</th><th>Об’єкт</th><th>Звідки</th><th /></tr></thead>
              <tbody>
                {data.items.map((e) => {
                  const open = expanded.has(e.id);
                  const n = Object.keys(e.changes ?? {}).length;
                  return (
                    <Fragment key={e.id}>
                      <tr>
                        <td className="tight num small">{fdatetime(e.at)}</td>
                        <td>{e.user ? <Link to={`?userId=${e.user.id}`}>{e.user.fullName}</Link> : <span className="muted">{who(e)}</span>}</td>
                        <td><span className={`pill act-${e.action}`}>{ACTION_TEXT[e.action]}</span></td>
                        <td>
                          {e.entity ? <>{ENTITY_TEXT[e.entity] ?? e.entity} <span className="muted small">#{e.entityId}</span></> : <span className="muted">—</span>}
                          {e.contractId && <div className="small"><Link to={`/contracts/${e.contractId}`}>договір #{e.contractId}</Link></div>}
                        </td>
                        <td className="small"><span className="num">{e.ip ?? '—'}</span>{e.userAgent && <div className="muted ua" title={e.userAgent}>{e.userAgent}</div>}</td>
                        <td className="r">{n > 0 && <button type="button" className="btn sm" aria-expanded={open} onClick={() => toggle(e.id)}>{open ? 'Сховати' : `Деталі (${n})`}</button>}</td>
                      </tr>
                      {open && <tr className="detail"><td colSpan={6}><ChangesTable entry={e} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => set({ page: p === 1 ? '' : String(p) })} />
        </>
      )}
    </>
  );
}
