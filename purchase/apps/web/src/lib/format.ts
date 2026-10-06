import type { ContractStatus, Role } from '@kk-gov-purchase/shared';

/** Дати й числа — у форматі uk-UA. */
export const fdate = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '—');

const dateTime = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'medium' });
export const fdatetime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');

export const fq = (n: number) => n.toLocaleString('uk-UA', { maximumFractionDigits: 3 });

const money = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Сума в гривнях; null → «—» */
export const fmoney = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${money.format(n)} ₴`);

const compact = new Intl.NumberFormat('uk-UA', { notation: 'compact', maximumFractionDigits: 1 });
export const fcompact = (n: number) => compact.format(n);

export const fpercent = (share: number | null | undefined) =>
  share === null || share === undefined ? '—' : `${(share * 100).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} %`;

export function fsize(b: number) {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Рядок з поля вводу → число; '' → null; некоректне → NaN */
export function parseQty(s: string): number | null {
  const v = s.trim().replace(',', '.').replace(/\s/g, '');
  if (v === '') return null;
  return /^\d+(\.\d+)?$/.test(v) ? Math.round(Number(v) * 1000) / 1000 : NaN;
}

/** Ціна: до 2 знаків; '' → null; некоректне → NaN */
export function parseMoney(s: string): number | null {
  const v = s.trim().replace(',', '.').replace(/\s/g, '');
  if (v === '') return null;
  return /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : NaN;
}

/** Відмінювання: plural(5, ['договір', 'договори', 'договорів']) */
export function plural(n: number, forms: [string, string, string]) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return forms[0];
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return forms[1];
  return forms[2];
}

export const STATUS_TEXT: Record<ContractStatus, string> = {
  waiting: 'Очікується',
  partial: 'Частково поставлено',
  overdue: 'Прострочено',
  completed: 'Виконано',
};

export const ROLE_TEXT: Record<Role, string> = {
  admin: 'Адміністратор',
  editor: 'Редактор',
  viewer: 'Перегляд',
};

export const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

/** Підпис періоду для графіків: 2026-04-01 → «кві 2026» / «II кв. 2026» / «2026» */
export function fperiod(period: string, granularity: 'month' | 'quarter' | 'year') {
  const [y, m] = period.split('-').map(Number);
  if (granularity === 'year') return String(y);
  if (granularity === 'quarter') return `${['I', 'II', 'III', 'IV'][Math.floor((m - 1) / 3)]} кв. ${y}`;
  return `${MONTHS[m - 1]} ${y}`;
}
