import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Пошук: pg_trgm + власна нормалізація тексту search_norm() + згенеровані колонки search_doc
 * з усіма текстовими полями запису і триграмні GIN-індекси по них.
 *
 * search_norm() — дзеркало apps/web/src/lib/search-norm.ts (тест звіряє їх):
 * нижній регістр (кирилицю переводимо явно — не залежимо від локалі БД), схожі кирилиця/латиниця
 * зводяться до однієї літери, і/ї, е/є/ё, г/ґ — однаково, апострофи й лапки видаляються,
 * латинська діакритика прибирається. Якщо функцію колись змінювати — новою міграцією з
 * перерахунком search_doc (ALTER TABLE ... DROP/ADD COLUMN).
 *
 * pg_trgm — "trusted"-розширення (PG13+): власнику БД досить права CREATE на базу.
 */
const FROM =
  'аАвВеЕєЄёЁіІїЇкКмМнНоОрРсСтТуУхХґҐБГДЖЗИЙЛПФЦЧШЩЬЮЯЪЫЭàáâäãåÀÁÂÄÃÅçÇèéêëÈÉÊËìíîïÌÍÎÏñÑòóôöõÒÓÔÖÕùúûüÙÚÛÜýÿÝ ' +
  '\'’ʼ‘`´ʹ"«»„“”';
const TO =
  'aabbeeeeeeiiiikkmmhhooppccttyyxxггбгджзийлпфцчшщьюяъыэaaaaaaaaaaaacceeeeeeeeiiiiiiiinnoooooooooouuuuuuuuyyy ';

const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;

export class Search1759700100000 implements MigrationInterface {
  name = 'Search1759700100000';

  async up(q: QueryRunner): Promise<void> {
    await q.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await q.query(`
      CREATE FUNCTION search_norm(t text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
        AS $$ SELECT translate(lower(t), ${lit(FROM)}, ${lit(TO)}) $$
    `);
    await q.query(`
      ALTER TABLE contracts ADD COLUMN search_doc text GENERATED ALWAYS AS
        (search_norm(number || ' ' || counterparty || ' ' || coalesce(notes, ''))) STORED;
      ALTER TABLE order_items ADD COLUMN search_doc text GENERATED ALWAYS AS
        (search_norm(name || ' ' || unit || ' ' || coalesce(cancel_reason, ''))) STORED;
      ALTER TABLE deliveries ADD COLUMN search_doc text GENERATED ALWAYS AS
        (search_norm(invoice_number || ' ' || coalesce(notes, ''))) STORED;
      ALTER TABLE files ADD COLUMN search_doc text GENERATED ALWAYS AS
        (search_norm(original_name)) STORED;

      CREATE INDEX contracts_search_trgm ON contracts USING gin (search_doc gin_trgm_ops);
      CREATE INDEX contracts_number_trgm ON contracts USING gin (search_norm(number) gin_trgm_ops);
      CREATE INDEX contracts_counterparty_trgm ON contracts USING gin (search_norm(counterparty) gin_trgm_ops);
      CREATE INDEX order_items_search_trgm ON order_items USING gin (search_doc gin_trgm_ops);
      CREATE INDEX order_items_name_trgm ON order_items USING gin (search_norm(name) gin_trgm_ops);
      CREATE INDEX deliveries_search_trgm ON deliveries USING gin (search_doc gin_trgm_ops);
      CREATE INDEX files_search_trgm ON files USING gin (search_doc gin_trgm_ops);
      CREATE INDEX contracts_file_idx ON contracts (file_id);
      CREATE INDEX deliveries_file_idx ON deliveries (file_id);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX contracts_search_trgm, contracts_number_trgm, contracts_counterparty_trgm, order_items_search_trgm,
        order_items_name_trgm, deliveries_search_trgm, files_search_trgm, contracts_file_idx, deliveries_file_idx;
      ALTER TABLE contracts DROP COLUMN search_doc;
      ALTER TABLE order_items DROP COLUMN search_doc;
      ALTER TABLE deliveries DROP COLUMN search_doc;
      ALTER TABLE files DROP COLUMN search_doc;
      DROP FUNCTION search_norm(text);
    `);
  }
}
