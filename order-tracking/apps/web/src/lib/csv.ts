/**
 * Експорт таблиці в CSV, який коректно відкриває Excel: UTF-8 з BOM, роздільник «;»
 * (у локалі uk-UA кома — десятковий роздільник), числа з десятковою комою.
 */
export type Cell = string | number | null | undefined;

const cell = (v: Cell) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const text = [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
