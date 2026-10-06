import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { AnalyticsQuery, Granularity } from '@order-tracking/shared';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { fcompact, fdate, fmoney, fpercent, fperiod, fq, STATUS_TEXT } from '../lib/format';
import { compact, useUrlState } from '../lib/url-state';
import { ContractFilters, FILTER_KEYS, type FilterValues } from '../components/ContractFilters';
import { LoadError, Loading, PageHead, Spinner, StatusPill } from '../components/ui';

const KEYS = [...FILTER_KEYS, 'granularity'] as const;

const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)', fontSize: 13 },
  labelStyle: { color: 'var(--fg)', fontWeight: 600 },
  cursor: { fill: 'var(--accent-soft)' },
};
const axis = { stroke: 'var(--muted)', fontSize: 12, tickLine: false };

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'info' | 'danger' }) {
  return (
    <div className="kpi">
      <span className="k">{label}</span>
      <span className={`v${tone ? ` c-${tone}` : ''}`}>{value}</span>
      {sub && <span className="m">{sub}</span>}
    </div>
  );
}

function Section({ title, children, onCsv }: { title: string; children: React.ReactNode; onCsv?: () => void }) {
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>{title}</h2>
        {onCsv && <button type="button" className="btn sm" onClick={onCsv}>⇩ CSV</button>}
      </div>
      <div className="panel-b">{children}</div>
    </section>
  );
}

/** Аналітика: KPI, розподіли й динаміка. Фільтри — ті самі, що в списку договорів, і живуть в адресі. */
export function AnalyticsPage() {
  const { values, set, reset } = useUrlState(KEYS);
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, values[k]])) as FilterValues;
  const granularity = (values.granularity || 'month') as Granularity;
  const query = compact(values) as AnalyticsQuery;
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['analytics', query],
    queryFn: () => api.analytics(query),
    placeholderData: keepPreviousData,
  });
  const listLink = (extra: Record<string, string> = {}) =>
    `/contracts?${new URLSearchParams({ ...(compact(filters) as Record<string, string>), ...extra })}`;

  const periodSelect = (
    <label className="inline small muted">Групувати за
      <select value={granularity} onChange={(e) => set({ granularity: e.target.value === 'month' ? '' : e.target.value })} style={{ width: 'auto' }}>
        <option value="month">місяцями</option>
        <option value="quarter">кварталами</option>
        <option value="year">роками</option>
      </select>
    </label>
  );

  return (
    <>
      <PageHead title="Аналітика" subtitle="Суми, виконання й своєчасність поставок за обраними договорами"
        actions={isFetching && !isPending ? <Spinner /> : undefined} />
      <ContractFilters value={filters} onApply={(f) => set(f)} onReset={() => reset(['granularity'])} extra={periodSelect} />

      {isPending ? <Loading /> : error ? <LoadError error={error} onRetry={() => void refetch()} /> : (() => {
        const { kpis: k, byStatus, byCounterparty, byPeriod, topItems, timeliness: t } = data;
        if (k.contracts === 0) return <div className="panel empty">За цими фільтрами договорів немає.</div>;
        const periods = byPeriod.map((p) => ({ ...p, label: fperiod(p.period, granularity) }));
        const topCp = byCounterparty.slice(0, 10).map((c) => ({ ...c, short: c.counterparty.length > 28 ? `${c.counterparty.slice(0, 27)}…` : c.counterparty }));
        const money = k.amount > 0;
        return (
          <div className="viz-root stack">
            <div className="kpis">
              <Kpi label="Договорів" value={fq(k.contracts)} sub={`${fq(k.counterparties)} контрагентів`} />
              <Kpi label="Сума договорів" value={money ? fmoney(k.amount) : '—'} sub={money ? undefined : 'ціни не вказано'} />
              <Kpi label="Отримано" value={fpercent(k.receivedShare)} sub={money ? fmoney(k.receivedAmount) : `${fq(k.received)} з ${fq(k.quantity)}`} tone="ok" />
              <Kpi label="Очікуємо" value={fq(k.pending)} sub={money ? fmoney(k.pendingAmount) : undefined} tone="info" />
              <Kpi label="Прострочено" value={fq(k.overdue)} sub={money ? `на ${fmoney(k.overdueAmount)}` : undefined} tone={k.overdue ? 'danger' : undefined} />
              <Kpi label="З недопоставкою" value={fq(k.withShortfall)} sub={`не зможуть: ${fq(k.cancelled)}${money ? ` · ${fmoney(k.cancelledAmount)}` : ''}`} />
              <Kpi label="Виконано" value={fq(k.completed)} sub={`з ${fq(k.contracts)}`} tone="ok" />
              <Kpi label="Поставки вчасно" value={fpercent(k.onTimeShare)} sub={`${fq(k.deliveries)} поставок`} />
            </div>

            <div className="grid2">
              <Section title="Договори за станом">
                <table>
                  <thead><tr><th>Стан</th><th className="r">Договорів</th><th className="r">Сума</th><th className="r">Очікуємо, од.</th></tr></thead>
                  <tbody>
                    {byStatus.map((s) => (
                      <tr key={s.status}>
                        <td><Link to={listLink({ status: s.status })}><StatusPill status={s.status} /></Link></td>
                        <td className="r num">{fq(s.contracts)}</td>
                        <td className="r num">{fmoney(s.amount)}</td>
                        <td className="r num">{fq(s.pending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="stack-bar mt" role="img" aria-label="Частки договорів за станом">
                  {byStatus.filter((s) => s.contracts).map((s) => (
                    <i key={s.status} className={`st-bg-${s.status}`} style={{ flexGrow: s.contracts }} title={`${STATUS_TEXT[s.status]}: ${s.contracts}`} />
                  ))}
                </div>
              </Section>

              <Section title="Своєчасність поставок">
                <div className="kpis small-kpis">
                  <Kpi label="Вчасно" value={fq(t.onTime)} tone="ok" />
                  <Kpi label="Із запізненням" value={fq(t.late)} tone={t.late ? 'danger' : undefined} sub={t.avgDelayDays !== null ? `у середньому ${fq(t.avgDelayDays)} дн.` : undefined} />
                  <Kpi label="Без орієнт. дати" value={fq(t.noDeadline)} />
                </div>
                {t.overdueContracts.length > 0 && (
                  <>
                    <h3 className="mt">Найбільш прострочені</h3>
                    <div className="tbl-box">
                      <table>
                        <thead><tr><th>Договір</th><th>Очікувалось</th><th className="r">Днів</th><th className="r">Очікуємо</th></tr></thead>
                        <tbody>
                          {t.overdueContracts.slice(0, 8).map((o) => (
                            <tr key={o.id}>
                              <td><Link to={`/contracts/${o.id}`}>№ {o.number}</Link><div className="small muted">{o.counterparty}</div></td>
                              <td className="num tight">{fdate(o.expectedDeliveryDate)}</td>
                              <td className="r num c-danger">{o.daysOverdue}</td>
                              <td className="r num tight">{fq(o.pending)}{o.pendingAmount ? <div className="small muted">{fmoney(o.pendingAmount)}</div> : null}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Section>
            </div>

            <Section title={money ? 'Сума укладених договорів за періодами' : 'Укладені договори за періодами'}
              onCsv={() => downloadCsv('аналітика-періоди', ['Період', 'Договорів', 'Сума, ₴', 'Поставок', 'Отримано, од.', 'Отримано, ₴', 'Вчасно', 'Із запізненням'],
                periods.map((p) => [p.label, p.contracts, p.amount, p.deliveries, p.receivedQuantity, p.receivedAmount, p.onTime, p.late]))}>
              <div className="chart" aria-label="Графік договорів за періодами">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={periods} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} tickFormatter={(v: number) => fcompact(v)} width={56} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [money ? fmoney(Number(v)) : fq(Number(v)), money ? 'Сума' : 'Договорів']} />
                    <Bar dataKey={money ? 'amount' : 'contracts'} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>

            <Section title="Поставки за періодами: вчасно чи із запізненням">
              <div className="chart" aria-label="Графік поставок за періодами">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={periods.filter((p) => p.deliveries)} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--line)" />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} allowDecimals={false} width={40} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 13, color: 'var(--fg)' }} />
                    <Bar dataKey="onTime" name="Вчасно" stackId="d" fill="var(--series-1)" stroke="var(--surface)" strokeWidth={1} maxBarSize={48} />
                    <Bar dataKey="late" name="Із запізненням" stackId="d" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="small muted">Поставки без орієнтовної дати не оцінюються. Вчасно — не пізніше орієнтовної дати договору.</p>
            </Section>

            <Section title="Контрагенти"
              onCsv={() => downloadCsv('аналітика-контрагенти', ['Контрагент', 'Договорів', 'Сума, ₴', 'Отримано, ₴', 'Очікуємо, ₴', 'Замовлено', 'Отримано', 'Очікуємо', 'Не зможуть', 'Прострочених'],
                byCounterparty.map((c) => [c.counterparty, c.contracts, c.amount, c.receivedAmount, c.pendingAmount, c.quantity, c.received, c.pending, c.cancelled, c.overdue]))}>
              {money && topCp.some((c) => c.amount > 0) && (
                <div className="chart" aria-label="Сума договорів за контрагентами">
                  <ResponsiveContainer width="100%" height={Math.max(160, topCp.length * 34)}>
                    <BarChart data={topCp} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke="var(--line)" />
                      <XAxis type="number" {...axis} tickFormatter={(v: number) => fcompact(v)} />
                      <YAxis type="category" dataKey="short" {...axis} width={180} />
                      <Tooltip {...tooltipStyle} labelFormatter={(_, p) => p?.[0]?.payload?.counterparty ?? ''}
                        formatter={(v) => [fmoney(Number(v)), 'Сума']} />
                      <Bar dataKey="amount" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="tbl-box">
                <table>
                  <thead><tr><th>Контрагент</th><th className="r">Договорів</th><th className="r">Сума</th><th className="r">Отримано</th><th className="r">Очікуємо</th><th className="r">Прострочено</th></tr></thead>
                  <tbody>
                    {byCounterparty.slice(0, 25).map((c) => (
                      <tr key={c.counterparty}>
                        <td><Link to={listLink({ counterparty: c.counterparty })}>{c.counterparty}</Link></td>
                        <td className="r num">{fq(c.contracts)}</td>
                        <td className="r num tight">{fmoney(c.amount)}</td>
                        <td className="r num tight">{money ? fmoney(c.receivedAmount) : fq(c.received)}</td>
                        <td className="r num tight">{money ? fmoney(c.pendingAmount) : fq(c.pending)}</td>
                        <td className={`r num${c.overdue ? ' c-danger' : ''}`}>{fq(c.overdue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Найменування (топ-20)"
              onCsv={() => downloadCsv('аналітика-найменування', ['Найменування', 'Од.', 'Договорів', 'Замовлено', 'Отримано', 'Очікуємо', 'Не зможуть', 'Сума, ₴'],
                topItems.map((i) => [i.name, i.unit, i.contracts, i.quantity, i.received, i.pending, i.cancelled, i.amount]))}>
              <div className="tbl-box">
                <table>
                  <thead><tr><th>Найменування</th><th className="r">Договорів</th><th className="r">Замовлено</th><th className="r">Отримано</th><th className="r">Очікуємо</th><th className="r">Не зможуть</th><th className="r">Сума</th></tr></thead>
                  <tbody>
                    {topItems.map((i) => (
                      <tr key={`${i.name}|${i.unit}`}>
                        <td><Link to={listLink({ item: i.name })}>{i.name}</Link></td>
                        <td className="r num">{fq(i.contracts)}</td>
                        <td className="r num tight">{fq(i.quantity)} {i.unit}</td>
                        <td className="r num c-ok">{fq(i.received)}</td>
                        <td className="r num c-info">{fq(i.pending)}</td>
                        <td className="r num c-danger">{fq(i.cancelled)}</td>
                        <td className="r num tight">{i.amount ? fmoney(i.amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        );
      })()}
    </>
  );
}
