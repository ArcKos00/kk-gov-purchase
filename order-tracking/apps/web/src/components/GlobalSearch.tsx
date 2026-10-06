import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchHit } from '@order-tracking/shared';
import { api } from '../lib/api';
import { clearRecentSearches, recentSearches, rememberSearch } from '../lib/storage';
import { Modal } from './dialog';
import { ENTITY_LABEL, HitContent, hitLink } from './search-hit';
import { Spinner } from './ui';

export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const isTyping = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    || (el as HTMLElement).isContentEditable);

/**
 * Глобальний пошук (Ctrl+K або «/»): по договорах, найменуваннях, поставках, файлах і контрагентах.
 * ↑/↓ — вибір, Enter — перейти, Esc — закрити.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(q.trim());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K' || e.code === 'KeyK') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === '/' && !isTyping(document.activeElement) && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.select(), 0);
  }, [open]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => api.globalSearch(debounced, 5),
    enabled: open && debounced.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const words = useMemo(() => debounced.split(/\s+/).filter(Boolean), [debounced]);
  const groups = debounced.length >= 2 ? (data?.groups ?? []).filter((g) => g.hits.length) : [];
  const flat: SearchHit[] = groups.flatMap((g) => g.hits);
  const recent = !debounced ? recentSearches() : [];
  useEffect(() => setActive(0), [debounced]);

  const close = () => setOpen(false);
  const go = (to: string) => {
    rememberSearch(q);
    close();
    navigate(to);
  };
  const showAll = () => go(`/search?q=${encodeURIComponent(q.trim())}`);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[active] && !e.ctrlKey) go(hitLink(flat[active]));
      else if (q.trim().length >= 2) showAll();
    }
  };

  useEffect(() => {
    document.getElementById(`gs-hit-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let index = -1;
  return (
    <>
      <button type="button" className="search-trigger" onClick={() => setOpen(true)} aria-keyshortcuts="Control+K /">
        <span aria-hidden>🔍</span>
        <span className="search-trigger-text">Пошук скрізь…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <Modal open={open} onClose={close} title="Пошук" wide>
        <div className="palette">
          <div className="palette-input">
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Номер договору, контрагент, товар, накладна, файл, дата…"
              aria-label="Пошуковий запит"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls="gs-results"
              aria-activedescendant={flat.length ? `gs-hit-${active}` : undefined}
              autoComplete="off"
            />
            {isFetching && <Spinner />}
          </div>

          <div id="gs-results" className="palette-results" role="listbox" aria-label="Результати">
            {!debounced && recent.length > 0 && (
              <div className="palette-group">
                <div className="palette-gh">
                  Нещодавні запити
                  <button type="button" className="link small" onClick={() => { clearRecentSearches(); setQ(' '); setQ(''); }}>очистити</button>
                </div>
                {recent.map((r) => (
                  <button key={r} type="button" className="palette-recent" onClick={() => setQ(r)}>{r}</button>
                ))}
              </div>
            )}
            {!debounced && !recent.length && (
              <div className="palette-hint">
                Слова можна вводити в будь-якому порядку, з помилками, латиницею чи кирилицею.
                Дату — як 15.09.2026.
              </div>
            )}
            {debounced.length === 1 && <div className="palette-hint">Введіть щонайменше 2 символи.</div>}
            {error && <div className="palette-hint c-danger">Не вдалося виконати пошук.</div>}
            {debounced.length >= 2 && data && !groups.length && !isFetching && (
              <div className="palette-hint">Нічого не знайдено за «{debounced}».</div>
            )}
            {groups.map((g) => (
              <div key={g.entity} className="palette-group">
                <div className="palette-gh">
                  {ENTITY_LABEL[g.entity]} <span className="muted">{g.total}</span>
                </div>
                {g.hits.map((h) => {
                  index++;
                  const i = index;
                  return (
                    <a
                      key={`${h.entity}-${h.id}-${h.title}`}
                      id={`gs-hit-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className={`hit${i === active ? ' active' : ''}`}
                      href={hitLink(h)}
                      onMouseMove={() => setActive(i)}
                      onClick={(e) => { e.preventDefault(); go(hitLink(h)); }}
                    >
                      <HitContent hit={h} words={words} />
                    </a>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="palette-foot small muted">
            <span><kbd>↑</kbd><kbd>↓</kbd> вибір · <kbd>Enter</kbd> відкрити · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> усі результати · <kbd>Esc</kbd> закрити</span>
            {q.trim().length >= 2 && <button type="button" className="link" onClick={showAll}>Усі результати →</button>}
          </div>
        </div>
      </Modal>
    </>
  );
}
