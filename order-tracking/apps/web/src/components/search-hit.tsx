import type { SearchEntity, SearchHit } from '@order-tracking/shared';
import { fdate } from '../lib/format';
import { Highlight } from './ui';

export const ENTITY_LABEL: Record<SearchEntity, string> = {
  contract: 'Договори',
  item: 'Найменування',
  delivery: 'Поставки',
  file: 'Файли',
  counterparty: 'Контрагенти',
};

export const ENTITY_ICON: Record<SearchEntity, string> = {
  contract: '📄',
  item: '📦',
  delivery: '🚚',
  file: '📎',
  counterparty: '🏢',
};

/** Куди веде результат пошуку. */
export function hitLink(h: SearchHit): string {
  switch (h.entity) {
    case 'counterparty':
      return `/contracts?counterparty=${encodeURIComponent(h.title)}`;
    case 'delivery':
      return `/contracts/${h.contractId}#delivery-${h.id}`;
    case 'item':
      return `/contracts/${h.contractId}#item-${h.id}`;
    default:
      return `/contracts/${h.contractId}`;
  }
}

export function HitContent({ hit, words }: { hit: SearchHit; words: string[] }) {
  return (
    <>
      <span className="hit-icon" aria-hidden>{ENTITY_ICON[hit.entity]}</span>
      <span className="hit-main">
        <span className="hit-title"><Highlight text={hit.title} words={words} /></span>
        <span className="hit-sub"><Highlight text={hit.subtitle} words={words} /></span>
        {hit.extra && <span className="hit-extra"><Highlight text={hit.extra} words={words} /></span>}
      </span>
      {hit.date && hit.entity !== 'counterparty' && <span className="hit-date num">{fdate(hit.date)}</span>}
    </>
  );
}
