export const searchText = (s) => String(s ?? '').trim().toUpperCase();

/** 'YYYY-MM-DD' -> 'DD.MM.YYYY' */
export function date(d) {
  if (!d) return '—';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
}

export function qty(n) {
  const v = Number(n ?? 0);
  return v.toLocaleString('uk-UA', { maximumFractionDigits: 3 });
}

/** Значення для <input type="number"> */
export function qtyInput(n) {
  if (n === null || n === undefined || n === '') return '';
  const v = Number(n);
  return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : String(n);
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const STATUSES = {
  waiting: { text: 'Очікується', badge: 'text-bg-secondary' },
  partial: { text: 'Частково поставлено', badge: 'text-bg-info' },
  overdue: { text: 'Прострочено', badge: 'text-bg-danger' },
  completed: { text: 'Виконано', badge: 'text-bg-success' },
};
