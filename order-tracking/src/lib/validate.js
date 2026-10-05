const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const str = (v) => (typeof v === 'string' ? v.trim() : '');

export function isDate(v) {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

/** '' -> null, некоректне -> NaN, інакше число з точністю до 0.001 */
export function parseQty(v) {
  const s = str(v).replace(',', '.').replace(/\s/g, '');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s) * 1000) / 1000;
}

/** Масив рядків із форми: items[0][name] -> [{name}] (qs/multer можуть повернути об'єкт). */
export function rows(v) {
  if (!v) return [];
  const list = Array.isArray(v) ? v : Object.keys(v).sort((a, b) => a - b).map((k) => v[k]);
  return list.filter((r) => r && typeof r === 'object');
}

export const MAX_QTY = 1e9;
