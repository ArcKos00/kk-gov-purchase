import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDITED = ['contracts', 'order_items', 'deliveries', 'delivery_lines', 'files', 'users'];

/**
 * Журнал дій. Входи/виходи пише AuthService, а всі зміни даних — один загальний тригер audit_row()
 * на кожній таблиці: дія, таблиця, id, договір, якого це стосується, і diff {поле: {from, to}}.
 * Хто/звідки — з контексту транзакції `app.audit_ctx` (JSON), який виставляє
 * AuditContextSubscriber на початку кожної транзакції TypeORM.
 * Так у журнал потрапляють і каскадні зміни, і зміни поза HTTP (bootstrap адміністратора — "система").
 */
export class Audit1759700300000 implements MigrationInterface {
  name = 'Audit1759700300000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE audit_log (
        id bigserial PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now(),
        action text NOT NULL,
        entity text,
        entity_id bigint,
        -- без FK: історія договору лишається і після його видалення
        contract_id integer,
        user_id integer REFERENCES users (id) ON DELETE SET NULL,
        login text,
        ip text,
        user_agent text,
        request_id text,
        changes jsonb
      );
      CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
      CREATE INDEX audit_log_contract_idx ON audit_log (contract_id, at DESC);
      CREATE INDEX audit_log_user_idx ON audit_log (user_id, at DESC);
      CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);
      CREATE INDEX audit_log_action_idx ON audit_log (action, at DESC);
    `);

    await q.query(`
      CREATE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        ctx jsonb := nullif(current_setting('app.audit_ctx', true), '')::jsonb;
        skip text[] := ARRAY['search_doc', 'number_search', 'counterparty_search', 'name_search', 'password_hash',
                             'failed_logins', 'locked_until', 'last_login_at', 'created_at', 'uploaded_at',
                             'stored_name'];
        old_j jsonb;
        new_j jsonb;
        diff jsonb := '{}';
        k text;
        eid bigint;
        cid integer;
      BEGIN
        IF TG_OP <> 'INSERT' THEN old_j := to_jsonb(OLD) - skip; END IF;
        IF TG_OP <> 'DELETE' THEN new_j := to_jsonb(NEW) - skip; END IF;

        IF TG_OP = 'UPDATE' THEN
          FOR k IN SELECT jsonb_object_keys(new_j) LOOP
            IF (new_j -> k) IS DISTINCT FROM (old_j -> k) THEN
              diff := diff || jsonb_build_object(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k));
            END IF;
          END LOOP;
          IF diff = '{}' THEN RETURN NULL; END IF;
        ELSIF TG_OP = 'INSERT' THEN
          SELECT coalesce(jsonb_object_agg(key, jsonb_build_object('to', value)), '{}') INTO diff
            FROM jsonb_each(new_j) WHERE value <> 'null'::jsonb AND key <> 'id';
        ELSE
          SELECT coalesce(jsonb_object_agg(key, jsonb_build_object('from', value)), '{}') INTO diff
            FROM jsonb_each(old_j) WHERE value <> 'null'::jsonb AND key <> 'id';
        END IF;

        eid := coalesce(new_j ->> 'id', old_j ->> 'id')::bigint;
        cid := CASE TG_TABLE_NAME
          WHEN 'contracts' THEN eid::integer
          WHEN 'order_items' THEN coalesce(new_j ->> 'contract_id', old_j ->> 'contract_id')::integer
          WHEN 'deliveries' THEN coalesce(new_j ->> 'contract_id', old_j ->> 'contract_id')::integer
          WHEN 'delivery_lines' THEN (SELECT d.contract_id FROM deliveries d
                                       WHERE d.id = coalesce(new_j ->> 'delivery_id', old_j ->> 'delivery_id')::integer)
          ELSE NULL
        END;
        -- Файли й рядки поставок (при каскадному видаленні) самі договору не знають: беремо договір,
        -- якого вже стосувалась ця транзакція, або той, що в адресі запиту.
        IF cid IS NULL AND TG_TABLE_NAME IN ('files', 'delivery_lines') THEN
          cid := coalesce(nullif(current_setting('app.audit_contract', true), '')::integer,
                          (ctx ->> 'contractId')::integer);
        END IF;
        IF cid IS NOT NULL THEN PERFORM set_config('app.audit_contract', cid::text, true); END IF;

        INSERT INTO audit_log (action, entity, entity_id, contract_id, user_id, login, ip, user_agent, request_id, changes)
        VALUES (lower(TG_OP), TG_TABLE_NAME, eid, cid, (ctx ->> 'userId')::integer, ctx ->> 'login',
                ctx ->> 'ip', ctx ->> 'userAgent', ctx ->> 'requestId', diff);
        RETURN NULL;
      END $$
    `);

    for (const t of AUDITED) {
      await q.query(`CREATE TRIGGER ${t}_audit AFTER INSERT OR UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION audit_row()`);
    }
  }

  async down(q: QueryRunner): Promise<void> {
    for (const t of AUDITED) await q.query(`DROP TRIGGER ${t}_audit ON ${t}`);
    await q.query('DROP FUNCTION audit_row(); DROP TABLE audit_log;');
  }
}
