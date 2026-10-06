import { MigrationInterface, QueryRunner } from 'typeorm';

/** Користувачі (ролі admin/editor/viewer) і серверні сесії. */
export class Auth1759700200000 implements MigrationInterface {
  name = 'Auth1759700200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE users (
        id serial PRIMARY KEY,
        login text NOT NULL,
        full_name text NOT NULL,
        role text NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
        active boolean NOT NULL DEFAULT true,
        password_hash text NOT NULL,
        failed_logins integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        last_login_at timestamptz,
        password_changed_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX users_login_uq ON users (lower(login));

      -- id — HMAC(SESSION_SECRET, токен із cookie): сам токен у БД не зберігається.
      CREATE TABLE sessions (
        id text PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        ip text,
        user_agent text
      );
      CREATE INDEX sessions_user_idx ON sessions (user_id);
      CREATE INDEX sessions_expires_idx ON sessions (expires_at);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE sessions, users');
  }
}
