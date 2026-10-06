import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchEntity } from '@kk-gov-purchase/shared';
import { api } from '../lib/api';
import { rememberSearch } from '../lib/storage';
import { useUrlState } from '../lib/url-state';
import { ENTITY_LABEL, HitContent, hitLink } from '../components/search-hit';
import { Empty, LoadError, Loading, PageHead, Spinner } from '../components/ui';

const ENTITIES: SearchEntity[] = ['contract', 'item', 'delivery', 'file', 'counterparty'];

/** Повна сторінка глобального пошуку: до 50 результатів у кожній групі, фільтр за типом. */
export function SearchPage() {
  const { values, set } = useUrlState(['q', 'in'] as const);
  const [draft, setDraft] = useState(values.q);
  useEffect(() => setDraft(values.q), [values.q]);
  const q = values.q.trim();
  const only = values.in ? (values.in.split(',') as SearchEntity[]) : undefined;

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: ['global-search-page', q, values.in],
    queryFn: () => api.globalSearch(q, 50, only),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (q.length >= 2) rememberSearch(q);
  }, [q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    set({ q: draft.trim() });
  };
  const words = q.split(/\s+/).filter(Boolean);
  const groups = (data?.groups ?? []).filter((g) => g.total > 0);
  const total = groups.reduce((s, g) => s + g.total, 0);

  return (
    <>
      <PageHead title="Пошук" subtitle="По всіх договорах, найменуваннях, поставках, файлах і контрагентах" />
      <form className="panel panel-b filters" onSubmit={submit} role="search">
        <div className="filter-main">
          <input type="search" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Пошуковий запит"
            placeholder="Наприклад: болт іваненко, НК-777, 15.09.2026" />
          <button className="btn primary" type="submit">Знайти</button>
        </div>
        <div className="chips mt">
          <button type="button" className={`chip-btn${!values.in ? ' on' : ''}`} onClick={() => set({ in: '' })}>Усе</button>
          {ENTITIES.map((e) => (
            <button key={e} type="button" className={`chip-btn${values.in === e ? ' on' : ''}`} onClick={() => set({ in: e })}>{ENTITY_LABEL[e]}</button>
          ))}
        </div>
      </form>

      {q.length < 2 ? <Empty>Введіть щонайменше 2 символи. Слова шукаються в будь-якому порядку, з одруківками, латиницею чи кирилицею.</Empty>
        : isPending ? <Loading text="Шукаємо…" />
          : error ? <LoadError error={error} onRetry={() => void refetch()} />
            : total === 0 ? <Empty>Нічого не знайдено за «{q}».</Empty> : (
              <>
                <div className="small muted">Знайдено: {total} {isFetching && <Spinner />}</div>
                {groups.map((g) => (
                  <section key={g.entity} className="panel">
                    <div className="panel-h">
                      <h2>{ENTITY_LABEL[g.entity]} <span className="muted small">{g.total}</span></h2>
                      {g.entity === 'contract' && <Link className="btn sm" to={`/contracts?q=${encodeURIComponent(q)}`}>Відкрити у списку договорів →</Link>}
                    </div>
                    <div className="hits">
                      {g.hits.map((h) => (
                        <Link key={`${h.entity}-${h.id}-${h.title}`} className="hit" to={hitLink(h)}>
                          <HitContent hit={h} words={words} />
                        </Link>
                      ))}
                    </div>
                    {g.total > g.hits.length && <div className="panel-b small muted">Показано {g.hits.length} з {g.total}. Уточніть запит.</div>}
                  </section>
                ))}
              </>
            )}
    </>
  );
}
