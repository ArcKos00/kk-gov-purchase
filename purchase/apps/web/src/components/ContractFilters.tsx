import { useEffect, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContractFilter, ContractStatus } from '@kk-gov-purchase/shared';
import { api } from '../lib/api';
import { fdate, STATUS_TEXT } from '../lib/format';

/** Усі ключі фільтра договорів — у такому порядку вони з'являються в адресі. */
export const FILTER_KEYS = [
  'q', 'number', 'counterparty', 'item', 'dateFrom', 'dateTo', 'expectedFrom', 'expectedTo', 'deliveryFrom', 'deliveryTo',
  'status', 'hasFile', 'hasShortfall', 'hasDeliveries', 'amountMin', 'amountMax', 'quantityMin', 'quantityMax',
] as const satisfies readonly (keyof ContractFilter)[];

export type FilterKey = (typeof FILTER_KEYS)[number];
export type FilterValues = Record<FilterKey, string>;

const STATUSES = Object.keys(STATUS_TEXT) as ContractStatus[];
const YES_NO_TEXT: Record<string, Record<string, string>> = {
  hasFile: { yes: 'з файлом договору', no: 'без файлу договору' },
  hasShortfall: { yes: 'з недопоставкою', no: 'без недопоставки' },
  hasDeliveries: { yes: 'є поставки', no: 'без поставок' },
};

/** Короткі підписи активних фільтрів (чіпи). */
export function filterChips(f: FilterValues): { key: FilterKey[]; text: string }[] {
  const chips: { key: FilterKey[]; text: string }[] = [];
  const range = (a: FilterKey, b: FilterKey, label: string, fmt = fdate) => {
    if (f[a] || f[b]) chips.push({ key: [a, b], text: `${label}: ${f[a] ? `з ${fmt(f[a])}` : ''}${f[a] && f[b] ? ' ' : ''}${f[b] ? `по ${fmt(f[b])}` : ''}` });
  };
  if (f.q) chips.push({ key: ['q'], text: `«${f.q}»` });
  if (f.number) chips.push({ key: ['number'], text: `№ ${f.number}` });
  if (f.counterparty) chips.push({ key: ['counterparty'], text: `Контрагент: ${f.counterparty}` });
  if (f.item) chips.push({ key: ['item'], text: `Найменування: ${f.item}` });
  range('dateFrom', 'dateTo', 'Дата договору');
  range('expectedFrom', 'expectedTo', 'Орієнт. поставка');
  range('deliveryFrom', 'deliveryTo', 'Поставка');
  if (f.status) chips.push({ key: ['status'], text: f.status.split(',').map((s) => STATUS_TEXT[s as ContractStatus] ?? s).join(' / ') });
  for (const k of ['hasFile', 'hasShortfall', 'hasDeliveries'] as const) if (f[k]) chips.push({ key: [k], text: YES_NO_TEXT[k][f[k]] ?? f[k] });
  range('amountMin', 'amountMax', 'Сума, ₴', (v) => v ?? '');
  range('quantityMin', 'quantityMax', 'Кількість', (v) => v ?? '');
  return chips;
}

const ADVANCED: FilterKey[] = FILTER_KEYS.filter((k) => k !== 'q');

/**
 * Панель фільтрів договорів: рядок пошуку + розширені фільтри.
 * Спільна для списку договорів і аналітики — однакові фільтри дають однаковий набір договорів.
 */
export function ContractFilters({ value, onApply, onReset, extra }: {
  value: FilterValues;
  onApply: (v: FilterValues) => void;
  onReset: () => void;
  extra?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(() => ADVANCED.some((k) => value[k]));
  const key = JSON.stringify(value);
  // Адреса змінилась (назад/вперед, чіп) — оновлюємо чернетку
  useEffect(() => setDraft(value), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: counterparties = [] } = useQuery({ queryKey: ['counterparties'], queryFn: api.counterparties, staleTime: 60_000 });

  const set = (k: FilterKey) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  const statuses = draft.status ? draft.status.split(',') : [];
  const toggleStatus = (s: ContractStatus) => {
    const next = statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s];
    setDraft({ ...draft, status: STATUSES.filter((x) => next.includes(x)).join(',') });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const numeric = new Set<FilterKey>(['amountMin', 'amountMax', 'quantityMin', 'quantityMax']);
    onApply(Object.fromEntries(FILTER_KEYS.map((k) => {
      let v = draft[k].trim();
      // «1 000,50» → «1000.50»; нечислове — відкидаємо, щоб не отримати помилку запиту
      if (numeric.has(k)) v = /^\d+(\.\d+)?$/.test(v.replace(/\s/g, '').replace(',', '.')) ? v.replace(/\s/g, '').replace(',', '.') : '';
      return [k, v];
    })) as FilterValues);
  };
  const chips = filterChips(value);
  const removeChip = (keys: FilterKey[]) => onApply({ ...value, ...Object.fromEntries(keys.map((k) => [k, ''])) });
  const advancedCount = ADVANCED.filter((k) => value[k]).length;

  return (
    <form className="panel panel-b filters" onSubmit={submit} role="search">
      <div className="filter-main">
        <input
          id="f-q"
          type="search"
          value={draft.q}
          onChange={set('q')}
          placeholder="Пошук: номер, контрагент, товар, накладна, примітки, файл… (слова в будь-якому порядку)"
          aria-label="Пошук договорів"
        />
        <button className="btn primary" type="submit">Знайти</button>
        <button type="button" className="btn" aria-expanded={open} aria-controls="adv-filters" onClick={() => setOpen(!open)}>
          Фільтри{advancedCount ? ` (${advancedCount})` : ''} {open ? '▴' : '▾'}
        </button>
        {extra}
      </div>

      {open && (
        <div id="adv-filters" className="grid mt">
          <label className="f">№ договору<input id="s-number" value={draft.number} onChange={set('number')} /></label>
          <label className="f">Контрагент
            <input id="s-counterparty" value={draft.counterparty} onChange={set('counterparty')} list="filter-counterparties" />
            <datalist id="filter-counterparties">{counterparties.map((cp) => <option key={cp} value={cp} />)}</datalist>
          </label>
          <label className="f">Найменування<input id="s-item" value={draft.item} onChange={set('item')} /></label>
          <fieldset className="f range">
            <legend>Дата договору</legend>
            <input id="s-from" type="date" aria-label="Дата договору з" value={draft.dateFrom} onChange={set('dateFrom')} />
            <input id="s-to" type="date" aria-label="Дата договору по" value={draft.dateTo} onChange={set('dateTo')} />
          </fieldset>
          <fieldset className="f range">
            <legend>Орієнтовна дата поставки</legend>
            <input type="date" aria-label="Орієнтовна дата з" value={draft.expectedFrom} onChange={set('expectedFrom')} />
            <input type="date" aria-label="Орієнтовна дата по" value={draft.expectedTo} onChange={set('expectedTo')} />
          </fieldset>
          <fieldset className="f range">
            <legend>Була поставка в період</legend>
            <input type="date" aria-label="Поставка з" value={draft.deliveryFrom} onChange={set('deliveryFrom')} />
            <input type="date" aria-label="Поставка по" value={draft.deliveryTo} onChange={set('deliveryTo')} />
          </fieldset>
          <fieldset className="f range">
            <legend>Сума договору, ₴</legend>
            <input inputMode="decimal" placeholder="від" aria-label="Сума від" value={draft.amountMin} onChange={set('amountMin')} />
            <input inputMode="decimal" placeholder="до" aria-label="Сума до" value={draft.amountMax} onChange={set('amountMax')} />
          </fieldset>
          <fieldset className="f range">
            <legend>Кількість (усього)</legend>
            <input inputMode="decimal" placeholder="від" aria-label="Кількість від" value={draft.quantityMin} onChange={set('quantityMin')} />
            <input inputMode="decimal" placeholder="до" aria-label="Кількість до" value={draft.quantityMax} onChange={set('quantityMax')} />
          </fieldset>
          <label className="f">Файл договору
            <select value={draft.hasFile} onChange={set('hasFile')}>
              <option value="">байдуже</option><option value="yes">є</option><option value="no">немає</option>
            </select>
          </label>
          <label className="f">Недопоставка
            <select value={draft.hasShortfall} onChange={set('hasShortfall')}>
              <option value="">байдуже</option><option value="yes">є</option><option value="no">немає</option>
            </select>
          </label>
          <label className="f">Поставки
            <select value={draft.hasDeliveries} onChange={set('hasDeliveries')}>
              <option value="">байдуже</option><option value="yes">були</option><option value="no">ще не було</option>
            </select>
          </label>
          <fieldset className="f wide status-set">
            <legend>Стан</legend>
            {STATUSES.map((s) => (
              <label key={s} className={`chip-check st-${s}${statuses.includes(s) ? ' on' : ''}`}>
                <input type="checkbox" checked={statuses.includes(s)} onChange={() => toggleStatus(s)} /> {STATUS_TEXT[s]}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {chips.length > 0 && (
        <div className="chips mt" aria-label="Активні фільтри">
          {chips.map((c) => (
            <span key={c.key.join()} className="chip">
              {c.text}
              <button type="button" aria-label={`Прибрати фільтр ${c.text}`} onClick={() => removeChip(c.key)}>×</button>
            </span>
          ))}
          <button type="button" className="link small" onClick={onReset}>Скинути все</button>
        </div>
      )}
    </form>
  );
}
