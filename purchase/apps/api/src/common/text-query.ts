import { escapeLike, Sql } from './sql';

/**
 * Розбір пошукового запиту на слова і SQL-умови для них.
 *
 * Кожне слово шукається як підрядок у нормалізованому тексті (`search_doc LIKE '%слово%'`,
 * триграмний GIN-індекс) або — для слів від 4 символів — нечітко (`слово <% search_doc`,
 * word_similarity з pg_trgm), щоб знаходити з одруківками. Слова поєднуються через AND і можуть
 * трапитися в різних полях того самого запису. Слово-дата (15.09.2026 або 2026-09-15) додатково
 * порівнюється з датами.
 */
export interface Word {
  /** Плейсхолдер нормалізованого слова: search_norm($n) */
  norm: string;
  /** Плейсхолдер шаблону LIKE */
  pat: string;
  fuzzy: boolean;
  /** Плейсхолдер дати, якщо слово схоже на дату */
  date: string | null;
}

export const MAX_WORDS = 8;
export const FUZZY_MIN_LENGTH = 4;
/** Поріг word_similarity для нечіткого збігу (за замовчуванням у pg_trgm 0.6 — надто суворо для коротких слів). */
export const WORD_SIMILARITY = 0.5;

const DATE_DMY = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(word: string): string | null {
  let y: string, m: string, d: string;
  const dmy = DATE_DMY.exec(word);
  const iso = DATE_ISO.exec(word);
  if (dmy) [, d, m, y] = dmy;
  else if (iso) [, y, m, d] = iso;
  else return null;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function splitWords(q: string | undefined | null): string[] {
  return (q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

/** Плейсхолдер, що додає параметр у запит лише при першому використанні (Postgres не любить невикористані $n). */
function lazy(sql: Sql, value: unknown, wrap: (ph: string) => string): () => string {
  let ph: string | null = null;
  return () => (ph ??= wrap(sql.p(value)));
}

export class TextQuery {
  readonly words: Word[];
  private readonly wholeRef: (() => string) | null;

  constructor(sql: Sql, q: string | undefined | null) {
    const raw = splitWords(q);
    this.words = raw.map((w) => {
      const date = parseDate(w);
      const norm = lazy(sql, w, (ph) => `search_norm(${ph})`);
      const pat = lazy(sql, escapeLike(w), (ph) => `'%' || search_norm(${ph}) || '%'`);
      const dateRef = date ? lazy(sql, date, (ph) => `${ph}::date`) : null;
      return {
        get norm() { return norm(); },
        get pat() { return pat(); },
        // Нечіткий збіг лише для "слів" (не для номерів/кодів із цифрами та символами)
        fuzzy: w.length >= FUZZY_MIN_LENGTH && /^[\p{L}'’ʼ-]+$/u.test(w),
        get date() { return dateRef ? dateRef() : null; },
      };
    });
    this.wholeRef = raw.length ? lazy(sql, raw.join(' '), (ph) => `search_norm(${ph})`) : null;
  }

  /** Плейсхолдер усього запиту (нормалізованого) — для ранжування */
  get whole(): string | null {
    return this.wholeRef ? this.wholeRef() : null;
  }

  get empty() {
    return this.words.length === 0;
  }

  /** Слово трапляється в одному з текстових виразів (search_doc) або дорівнює одній з дат. */
  match(w: Word, docs: string[], dates: string[] = []): string {
    const parts = docs.map((d) => `${d} LIKE ${w.pat}`);
    if (w.fuzzy) parts.push(...docs.map((d) => `${w.norm} <% ${d}`));
    if (w.date) parts.push(...dates.map((d) => `${d} = ${w.date}`));
    return parts.join(' OR ');
  }

  /**
   * Усі слова — в договорі `c` або в будь-якому його найменуванні, поставці чи файлі.
   * Повертає умови (по одній на слово) для WHERE.
   */
  contractConditions(alias = 'c'): string[] {
    return this.words.map((w) => [
      this.match(w, [`${alias}.search_doc`], [`${alias}.contract_date`, `${alias}.expected_delivery_date`]),
      `EXISTS (SELECT 1 FROM order_items qi WHERE qi.contract_id = ${alias}.id AND (${this.match(w, ['qi.search_doc'])}))`,
      `EXISTS (SELECT 1 FROM deliveries qd WHERE qd.contract_id = ${alias}.id AND (${this.match(w, ['qd.search_doc'], ['qd.date'])}))`,
      `EXISTS (SELECT 1 FROM files qf WHERE (qf.id = ${alias}.file_id OR qf.id IN (SELECT qd2.file_id FROM deliveries qd2 WHERE qd2.contract_id = ${alias}.id)) AND (${this.match(w, ['qf.search_doc'])}))`,
    ].join(' OR '));
  }

  /** Оцінка релевантності договору (0..1+) для сортування. */
  contractScore(alias = 'c'): string {
    if (!this.whole) return '0';
    return `greatest(word_similarity(${this.whole}, ${alias}.search_doc),
      coalesce((SELECT max(word_similarity(${this.whole}, qi.search_doc)) FROM order_items qi WHERE qi.contract_id = ${alias}.id), 0) * 0.9)`;
  }
}

/** SET LOCAL порогу нечіткого пошуку — викликати всередині транзакції. */
export const SET_SIMILARITY = `SET LOCAL pg_trgm.word_similarity_threshold = ${WORD_SIMILARITY}`;
