import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ContractSearch, ContractSort, ContractSummary, SortDir } from '@order-tracking/shared';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { fdate, fmoney, fq, STATUS_TEXT } from '../lib/format';
import { savedFilters, setSavedFilters, type SavedFilter } from '../lib/storage';
import { compact, useUrlState } from '../lib/url-state';
import { searchNorm } from '../lib/search-norm';
import { useAuth } from '../auth/auth';
import { ContractFilters, FILTER_KEYS, type FilterValues } from '../components/ContractFilters';
import { useToast } from '../components/toast';
import {
  Empty, errorText, Highlight, LoadError, Loading, PageHead, Pagination, ProgressBar, SortTh, Spinner, StatusPill,
} from '../components/ui';

const KEYS = [...FILTER_KEYS, 'sort', 'dir', 'page', 'pageSize'] as const;
const PAGE_SIZES = ['25', '50', '100'];

export function ContractsPage() {
  const navigate = useNavigate();
  const { canEdit } = useAuth();
  const toast = useToast();
  const { values, set, reset } = useUrlState(KEYS);
  const [, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, values[k]])) as FilterValues;
  const hasFilters = FILTER_KEYS.some((k) => values[k]);
  const query = compact(values) as ContractSearch;

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['contracts', query],
    queryFn: () => api.search(query),
    placeholderData: keepPreviousData,
  });

  const sort = (values.sort || undefined) as ContractSort | undefined;
  const dir = (values.dir || undefined) as SortDir | undefined;
  const onSort = (s: ContractSort, d: SortDir) => set({ sort: s, dir: d, page: '' });
  const words = useMemo(() => [values.q, values.item].join(' ').split(/\s+/).filter(Boolean), [values.q, values.item]);
  const itemNeedle = searchNorm(values.item.trim());

  // ---- збережені пошуки (у браузері) ----
  const [saved, setSaved] = useState<SavedFilter[]>(savedFilters);
  const currentQs = new URLSearchParams(compact(filters) as Record<string, string>).toString();
  const saveCurrent = () => {
    const name = window.prompt('Назва для збереженого пошуку:', values.q || values.counterparty || 'Мій фільтр');
    if (!name?.trim()) return;
    const list = [...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), query: currentQs }];
    setSaved(list);
    setSavedFilters(list);
    toast.ok(`Пошук «${name.trim()}» збережено.`);
  };
  const removeSaved = (name: string) => {
    const list = saved.filter((s) => s.name !== name);
    setSaved(list);
    setSavedFilters(list);
  };

  // ---- експорт усіх знайдених у CSV ----
  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: ContractSummary[] = [];
      for (let page = 1; page <= 50; page++) {
        const res = await api.search({ ...query, page: String(page), pageSize: '200' });
        rows.push(...res.items);
        if (rows.length >= res.total || !res.items.length) break;
      }
      downloadCsv(`договори-${new Date().toISOString().slice(0, 10)}`, [
        '№ договору', 'Дата', 'Контрагент', 'Орієнт. поставка', 'Стан', 'Замовлено', 'Отримано', 'Очікуємо', 'Не зможуть',
        'Сума, ₴', 'Отримано на суму, ₴', 'Поставок', 'Остання поставка', 'Найменування',
      ], rows.map((c) => [
        c.number, fdate(c.contractDate), c.counterparty, fdate(c.expectedDeliveryDate), STATUS_TEXT[c.status],
        c.totals.quantity, c.totals.received, c.totals.pending, c.totals.cancelled, c.totals.amount, c.totals.receivedAmount,
        c.deliveriesCount, fdate(c.lastDeliveryDate), c.items.map((i) => `${i.name} — ${i.quantity} ${i.unit}`).join('; '),
      ]));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHead
        title="Договори"
        subtitle="Що замовили, що приїхало, що ще очікуємо"
        actions={canEdit && <Link to="/contracts/new" className="btn primary">＋ Новий договір</Link>}
      />

      <ContractFilters
        value={filters}
        onApply={(f) => set({ ...f, page: '' })}
        onReset={() => reset(['sort', 'dir', 'pageSize'])}
        extra={hasFilters && <button type="button" className="btn ghost" onClick={saveCurrent} title="Зберегти поточний пошук">☆ Зберегти</button>}
      />

      {saved.length > 0 && (
        <div className="chips" aria-label="Збережені пошуки">
          <span className="small muted">Збережені:</span>
          {saved.map((s) => (
            <span key={s.name} className={`chip saved${s.query === currentQs ? ' on' : ''}`}>
              <button type="button" className="link" onClick={() => setParams(new URLSearchParams(s.query))}>{s.name}</button>
              <button type="button" aria-label={`Видалити збережений пошук ${s.name}`} onClick={() => removeSaved(s.name)}>×</button>
            </span>
          ))}
        </div>
      )}

      {isPending ? <Loading /> : error ? <LoadError error={error} onRetry={() => void refetch()} /> : data.total === 0 ? (
        <Empty>
          {hasFilters
            ? <>Нічого не знайдено. Спробуйте інший запит або <button type="button" className="link" onClick={() => reset()}>скиньте фільтри</button>.</>
            : <>Ще немає жодного договору.{canEdit && <> Створіть перший кнопкою «＋ Новий договір».</>}</>}
        </Empty>
      ) : (
        <>
          <div className="list-bar">
            <span className="small muted">Знайдено: <b>{fq(data.total)}</b> {isFetching && <Spinner />}</span>
            <span className="actions">
              <label className="small muted inline">На сторінці
                <select value={values.pageSize || '25'} onChange={(e) => set({ pageSize: e.target.value === '25' ? '' : e.target.value, page: '' })} style={{ width: 'auto' }}>
                  {PAGE_SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <button type="button" className="btn sm" onClick={() => void exportCsv()} disabled={exporting}>
                {exporting ? 'Експорт…' : '⇩ CSV'}
              </button>
            </span>
          </div>
          <div className="panel tbl-box">
            <table className="list-tbl">
              <thead>
                <tr>
                  <SortTh label="№ договору" field="number" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Дата" field="contractDate" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Контрагент" field="counterparty" sort={sort} dir={dir} onSort={onSort} />
                  <th>Найменування</th>
                  <SortTh label="Сума" field="amount" sort={sort} dir={dir} onSort={onSort} className="r" />
                  <SortTh label="Орієнт. поставка" field="expectedDeliveryDate" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Виконання" field="progress" sort={sort} dir={dir} onSort={onSort} />
                  <SortTh label="Стан" field="status" sort={sort} dir={dir} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => {
                  const shown = itemNeedle ? c.items.filter((i) => searchNorm(i.name).includes(itemNeedle)) : c.items.slice(0, 3);
                  const rest = c.items.length - shown.length;
                  return (
                    <tr key={c.id} className="clickable" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) navigate(`/contracts/${c.id}`); }}>
                      <td className="tight">
                        <Link to={`/contracts/${c.id}`}><b><Highlight text={c.number} words={words} /></b></Link>
                        {c.hasFile && <span className="muted small" title="Є файл договору"> 📎</span>}
                      </td>
                      <td className="tight num">{fdate(c.contractDate)}</td>
                      <td><Highlight text={c.counterparty} words={words} /></td>
                      <td className="small">
                        {shown.map((i) => (
                          <div key={i.id}>
                            <Highlight text={i.name} words={words} />{' '}
                            <span className="muted">
                              — {fq(i.quantity)} {i.unit} (отр. {fq(i.received)}, очік. {fq(i.pending)}
                              {i.cancelled > 0 && `, не зможуть ${fq(i.cancelled)}`})
                            </span>
                          </div>
                        ))}
                        {rest > 0 && <div className="muted">і ще {rest}…</div>}
                      </td>
                      <td className="r tight num">{fmoney(c.totals.amount)}</td>
                      <td className="tight num">{fdate(c.expectedDeliveryDate)}</td>
                      <td><ProgressBar total={c.totals.quantity} received={c.totals.received} cancelled={c.totals.cancelled} /></td>
                      <td><StatusPill status={c.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total}
            onPage={(p) => { set({ page: p === 1 ? '' : String(p) }); window.scrollTo({ top: 0 }); }} />
        </>
      )}
    </>
  );
}
