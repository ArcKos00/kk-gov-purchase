import { useSearchParams } from 'react-router';

/**
 * Стан фільтрів в адресі сторінки (можна поділитися посиланням / зберегти в закладки).
 * `set(patch)` змінює лише вказані ключі; порожні значення прибираються з адреси.
 */
export function useUrlState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ''])) as Record<K, string>;
  const set = (patch: Partial<Record<K, string | undefined>>, replace = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch) as [string, string | undefined][]) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace });
  };
  const reset = (keep: K[] = []) => {
    const next = new URLSearchParams();
    for (const k of keep) if (params.get(k)) next.set(k, params.get(k)!);
    setParams(next);
  };
  return { values, set, reset, params };
}

/** Об'єкт без порожніх рядків (для запитів). */
export const compact = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null)) as Partial<T>;
