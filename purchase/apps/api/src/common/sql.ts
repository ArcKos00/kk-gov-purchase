/**
 * Мінімальний збирач сирого SQL з позиційними параметрами ($1, $2…).
 * Для складних запитів (пошук, аналітика) сирий SQL читається простіше за QueryBuilder.
 */
export class Sql {
  readonly params: unknown[] = [];
  readonly where: string[] = [];

  /** Додає параметр і повертає його плейсхолдер. */
  p(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  and(condition: string) {
    this.where.push(condition);
    return this;
  }

  whereSql() {
    return this.where.length ? `WHERE ${this.where.map((w) => `(${w})`).join(' AND ')}` : '';
  }
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Числа з Postgres (numeric/bigint/count) приходять рядками. */
export const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface Paging {
  page: number;
  pageSize: number;
  offset: number;
}

export function paging(page?: string | number, pageSize?: string | number, def = 25, max = 200): Paging {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const s = Math.min(max, Math.max(1, Math.floor(Number(pageSize) || def)));
  return { page: p, pageSize: s, offset: (p - 1) * s };
}

/** Рядок дати Postgres 'date' може прийти як Date — нормалізуємо до YYYY-MM-DD. */
export function isoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const p = (x: number) => String(x).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}
