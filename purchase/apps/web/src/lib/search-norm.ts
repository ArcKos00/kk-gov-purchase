/**
 * Нормалізація тексту для пошуку — дзеркало SQL-функції `search_norm()` з міграції
 * apps/api/src/database/migrations/1759700100000-Search.ts. Використовується для підсвічування збігів.
 * Тест apps/api/test/search.spec.ts звіряє її з SQL-версією.
 *
 *  - регістр не важливий (кирилиця теж — незалежно від локалі БД);
 *  - схожі кирилиця/латиниця зводяться до однієї літери («М8» = «M8», «Р» = «P»);
 *  - і/ї, е/є/ё, г/ґ — однаково;
 *  - апострофи (’ ʼ ' `) і лапки («» " „ “) ігноруються: «об'єкт» = «обєкт»;
 *  - латинські літери з діакритикою — без неї (é → e).
 */

const FOLD: Record<string, string> = {
  a: 'аА', b: 'вВ', e: 'еЕєЄёЁ', i: 'іІїЇ', k: 'кК', m: 'мМ', h: 'нН', o: 'оО', p: 'рР', c: 'сС',
  t: 'тТ', y: 'уУ', x: 'хХ', г: 'ґҐ',
};
const UPPER = 'БГДЖЗИЙЛПФЦЧШЩЬЮЯЪЫЭ';
const LOWER = 'бгджзийлпфцчшщьюяъыэ';
const DIACRITICS: Record<string, string> = {
  a: 'àáâäãåÀÁÂÄÃÅ', c: 'çÇ', e: 'èéêëÈÉÊË', i: 'ìíîïÌÍÎÏ', n: 'ñÑ', o: 'òóôöõÒÓÔÖÕ', u: 'ùúûüÙÚÛÜ', y: 'ýÿÝ',
};
/** Символи, що видаляються */
export const SEARCH_DELETE = '\'’ʼ‘`´ʹ"«»„“”';

function buildPairs(): [string, string][] {
  const pairs: [string, string][] = [];
  for (const [to, from] of Object.entries(FOLD)) for (const ch of from) pairs.push([ch, to]);
  [...UPPER].forEach((ch, i) => pairs.push([ch, LOWER[i]]));
  for (const [to, from] of Object.entries(DIACRITICS)) for (const ch of from) pairs.push([ch, to]);
  pairs.push([' ', ' ']);
  return pairs;
}

const PAIRS = buildPairs();
/** Аргументи для SQL translate(): FROM (заміни + видалення) і TO */
export const SEARCH_TRANSLATE_FROM = PAIRS.map((p) => p[0]).join('') + SEARCH_DELETE;
export const SEARCH_TRANSLATE_TO = PAIRS.map((p) => p[1]).join('');

const MAP = new Map(PAIRS);
const DELETE = new Set(SEARCH_DELETE);

/** Нормалізує один символ: '' — символ видаляється. */
export function normChar(ch: string): string {
  if (DELETE.has(ch)) return '';
  return MAP.get(ch) ?? ch.toLowerCase();
}

export function searchNorm(s: string): string {
  let out = '';
  for (const ch of s) out += normChar(ch);
  return out;
}

/** Слова запиту (нормалізовані, без порожніх). */
export function searchWords(q: string): string[] {
  return q.split(/\s+/).map(searchNorm).filter(Boolean);
}

/**
 * Діапазони [start, end) у вихідному тексті, де трапляються слова запиту
 * (з урахуванням нормалізації — тому працює і для «м8» → «M8»).
 */
export function matchRanges(text: string, rawWords: string[]): [number, number][] {
  const words = rawWords.map(searchNorm).filter(Boolean);
  if (!text || !words.length) return [];
  // Нормалізований текст + відповідність кожного його символу позиції у вихідному.
  let norm = '';
  const pos: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normChar(ch);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      pos.push(i);
    }
    i += ch.length;
  }
  const ranges: [number, number][] = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const at = norm.indexOf(w, from);
      if (at < 0) break;
      const end = at + w.length - 1;
      ranges.push([pos[at], pos[end] + (text.codePointAt(pos[end])! > 0xffff ? 2 : 1)]);
      from = at + Math.max(1, w.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
