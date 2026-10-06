import { useEffect, useState, type ReactNode } from 'react';
import type { ContractStatus, SortDir } from '@order-tracking/shared';
import { ApiError } from '../lib/api';
import { fq, STATUS_TEXT } from '../lib/format';
import { matchRanges } from '../lib/search-norm';

export function StatusPill({ status }: { status: ContractStatus }) {
  return <span className={`pill st-${status}`}>{STATUS_TEXT[status]}</span>;
}

/** Смуга виконання: зелене — отримано, червоне — не зможуть. */
export function ProgressBar({ total, received, cancelled }: { total: number; received: number; cancelled: number }) {
  const t = total > 0 ? total : 1;
  const rec = (received / t) * 100;
  const can = (cancelled / t) * 100;
  return (
    <div className="bar" title={`Отримано ${Math.round(rec)}% · Не зможуть ${Math.round(can)}%`} role="img"
      aria-label={`Отримано ${Math.round(rec)}%, не зможуть ${Math.round(can)}%`}>
      <i className="rec" style={{ width: `${rec}%` }} />
      <i className="can" style={{ width: `${can}%` }} />
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <div className="err">{message}</div> : null;
}

/** Загальна помилка форми: "_" з 422 або будь-яка інша помилка запиту. */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 422 && !error.errors._) return <div className="alert bad" role="alert">{error.message}</div>;
    return <div className="alert bad" role="alert">{error.errors._ ?? error.message}</div>;
  }
  return <div className="alert bad" role="alert">Не вдалося виконати запит.</div>;
}

export const errorText = (error: unknown) =>
  error instanceof ApiError ? (error.errors._ ?? error.message) : 'Не вдалося виконати запит.';

/**
 * Помилки полів з останньої відповіді 422. Помилка поля ховається, щойно користувач
 * змінив це поле (`touch(key)`), і з'являється знову лише після наступного збереження.
 */
export function useFieldErrors(error: unknown) {
  const [touched, setTouched] = useState<Set<string>>(new Set());
  useEffect(() => setTouched(new Set()), [error]);
  const errors = error instanceof ApiError ? error.errors : {};
  return {
    err: (key: string) => (touched.has(key) ? undefined : errors[key]),
    touch: (key: string) => {
      if (errors[key] && !touched.has(key)) setTouched(new Set(touched).add(key));
    },
  };
}

export function Spinner({ label = 'Завантаження…' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />;
}

export function Loading({ text = 'Завантаження…' }: { text?: string }) {
  return <div className="panel empty"><Spinner /> {text}</div>;
}

export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'Не вдалося завантажити дані.';
  return (
    <div className="panel empty" role="alert">
      {message}
      {onRetry && <div className="mt"><button type="button" className="btn" onClick={onRetry}>Спробувати ще раз</button></div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="panel empty">{children}</div>;
}

/** Підсвічує в тексті слова запиту (з урахуванням нормалізації: регістр, і/ї, М8/M8, апострофи). */
export function Highlight({ text, words }: { text: string | null | undefined; words: string[] }) {
  if (!text) return null;
  const ranges = matchRanges(text, words);
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e], i) => {
    if (s > at) out.push(text.slice(at, s));
    out.push(<mark key={i}>{text.slice(s, e)}</mark>);
    at = e;
  });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/** Заголовок колонки з сортуванням. */
export function SortTh<S extends string>({ label, field, sort, dir, onSort, className }: {
  label: string;
  field: S;
  sort: S | undefined;
  dir: SortDir | undefined;
  onSort: (field: S, dir: SortDir) => void;
  className?: string;
}) {
  const active = sort === field;
  const nextDir: SortDir = active && dir === 'desc' ? 'asc' : active ? 'desc' : 'desc';
  return (
    <th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort${active ? ' active' : ''}`} onClick={() => onSort(field, nextDir)}>
        {label} <span aria-hidden>{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

export function Pagination({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [...new Set([1, page - 1, page, page + 1, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <nav className="pager" aria-label="Сторінки">
      <span className="muted small">{fq(from)}–{fq(to)} з {fq(total)}</span>
      <button type="button" className="btn sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Назад</button>
      {nums.map((p, i) => (
        <span key={p} className="pager-n">
          {i > 0 && p - nums[i - 1] > 1 && <span className="muted">…</span>}
          <button type="button" className={`btn sm${p === page ? ' primary' : ''}`} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
        </span>
      ))}
      <button type="button" className="btn sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Далі ›</button>
    </nav>
  );
}

export function PageHead({ title, subtitle, actions, back }: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <>
      {back && <div>{back}</div>}
      <div className="head">
        <div>
          <h1>{title}</h1>
          {subtitle && <div className="muted">{subtitle}</div>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </div>
    </>
  );
}
