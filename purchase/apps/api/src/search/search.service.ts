import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { SearchEntity, SearchGroup, SearchHit, SearchResults } from '@kk-gov-purchase/shared';
import { Sql } from '../common/sql';
import { SET_SIMILARITY, TextQuery, Word } from '../common/text-query';

export const SEARCH_ENTITIES: SearchEntity[] = ['contract', 'item', 'delivery', 'file', 'counterparty'];

interface HitRow {
  id: number;
  contract_id: number | null;
  title: string;
  subtitle: string;
  extra: string | null;
  date: string | null;
  total: string;
}

const fmtDate = (col: string) => `to_char(${col}, 'DD.MM.YYYY')`;

/**
 * Глобальний пошук по всіх сутностях. Кожне слово запиту має трапитися в записі
 * (у будь-якому його полі або в полях договору, до якого він належить), причому хоча б одне —
 * у самому записі (інакше пошук "Д-125" видав би всі найменування договору Д-125).
 */
@Injectable()
export class SearchService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async search(q: string, limit: number, only?: SearchEntity[]): Promise<SearchResults> {
    const entities = only?.length ? only : SEARCH_ENTITIES;
    if (!q.trim()) return { q, groups: [] };
    return this.ds.transaction(async (em) => {
      await em.query(SET_SIMILARITY);
      const groups: SearchGroup[] = [];
      for (const entity of entities) groups.push(await this.group(em, entity, q, limit));
      return { q, groups };
    });
  }

  private async group(em: EntityManager, entity: SearchEntity, q: string, limit: number): Promise<SearchGroup> {
    const sql = new Sql();
    const t = new TextQuery(sql, q);
    const build = BUILDERS[entity];
    const { query } = build(sql, t);
    const rows: HitRow[] = await em.query(`${query} LIMIT ${limit}`, sql.params);
    return {
      entity,
      total: rows.length ? Number(rows[0].total) : 0,
      hits: rows.map((r): SearchHit => ({
        entity,
        id: Number(r.id),
        contractId: r.contract_id === null ? null : Number(r.contract_id),
        title: r.title,
        subtitle: r.subtitle,
        extra: r.extra,
        date: r.date,
      })),
    };
  }
}

type Builder = (sql: Sql, t: TextQuery) => { query: string };

/** Кожне слово — у власних полях запису (own) або в договорі; хоча б одне — у власних. */
function ownOrContract(t: TextQuery, own: (w: Word) => string, contract = 'c') {
  const each = t.words.map((w) => `(${own(w)}) OR (${t.match(w, [`${contract}.search_doc`])})`);
  const any = t.words.map((w) => `(${own(w)})`).join(' OR ');
  return [...each, any].map((x) => `(${x})`).join(' AND ');
}

const BUILDERS: Record<SearchEntity, Builder> = {
  contract: (sql, t) => ({
    query: `
      SELECT c.id, c.id AS contract_id, '№ ' || c.number AS title,
             c.counterparty || ' · від ' || ${fmtDate('c.contract_date')} AS subtitle,
             c.notes AS extra, c.contract_date::text AS date, count(*) OVER () AS total
        FROM contracts c
       WHERE ${t.contractConditions('c').map((x) => `(${x})`).join(' AND ')}
       ORDER BY ${t.contractScore('c')} DESC, c.contract_date DESC, c.id DESC`,
  }),

  item: (sql, t) => ({
    query: `
      SELECT i.id, c.id AS contract_id, i.name AS title,
             '№ ' || c.number || ' · ' || c.counterparty AS subtitle,
             trim(to_char(i.quantity, 'FM999999999990.###'), '.') || ' ' || i.unit
               || coalesce(' · не зможуть: ' || i.cancel_reason, '') AS extra,
             c.contract_date::text AS date, count(*) OVER () AS total
        FROM order_items i JOIN contracts c ON c.id = i.contract_id
       WHERE ${ownOrContract(t, (w) => t.match(w, ['i.search_doc']))}
       ORDER BY word_similarity(${t.whole}, i.search_doc) DESC, c.contract_date DESC, i.id`,
  }),

  delivery: (sql, t) => ({
    query: `
      SELECT d.id, c.id AS contract_id, 'Накладна № ' || d.invoice_number AS title,
             ${fmtDate('d.date')} || ' · договір № ' || c.number || ' · ' || c.counterparty AS subtitle,
             d.notes AS extra, d.date::text AS date, count(*) OVER () AS total
        FROM deliveries d JOIN contracts c ON c.id = d.contract_id
       WHERE ${ownOrContract(t, (w) => t.match(w, ['d.search_doc'], ['d.date']))}
       ORDER BY word_similarity(${t.whole}, d.search_doc) DESC, d.date DESC, d.id DESC`,
  }),

  file: (sql, t) => ({
    query: `
      SELECT f.id, c.id AS contract_id, f.original_name AS title,
             CASE WHEN d.id IS NULL THEN 'Файл договору № ' || c.number
                  ELSE 'Скан накладної № ' || d.invoice_number || ' · договір № ' || c.number END
               || ' · ' || c.counterparty AS subtitle,
             NULL AS extra, coalesce(d.date, c.contract_date)::text AS date, count(*) OVER () AS total
        FROM files f
        LEFT JOIN deliveries d ON d.file_id = f.id
        JOIN contracts c ON c.id = coalesce(d.contract_id, (SELECT c2.id FROM contracts c2 WHERE c2.file_id = f.id LIMIT 1))
       WHERE ${ownOrContract(t, (w) => t.match(w, ['f.search_doc']))}
       ORDER BY word_similarity(${t.whole}, f.search_doc) DESC, f.id DESC`,
  }),

  counterparty: (sql, t) => ({
    query: `
      SELECT 0 AS id, NULL::int AS contract_id, cp.counterparty AS title,
             cp.contracts || ' ' || CASE WHEN cp.contracts % 10 = 1 AND cp.contracts % 100 <> 11 THEN 'договір'
                                        WHEN cp.contracts % 10 BETWEEN 2 AND 4 AND cp.contracts % 100 NOT BETWEEN 12 AND 14 THEN 'договори'
                                        ELSE 'договорів' END AS subtitle,
             NULL AS extra, cp.last_date::text AS date, count(*) OVER () AS total
        FROM (SELECT min(c.counterparty) AS counterparty, count(*)::int AS contracts, max(c.contract_date) AS last_date,
                     search_norm(c.counterparty) AS doc
                FROM contracts c GROUP BY search_norm(c.counterparty)) cp
       WHERE ${t.words.map((w) => `(${t.match(w, ['cp.doc'])})`).join(' AND ')}
       ORDER BY word_similarity(${t.whole}, cp.doc) DESC, cp.contracts DESC`,
  }),
};
