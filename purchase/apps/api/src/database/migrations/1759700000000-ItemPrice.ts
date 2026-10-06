import { MigrationInterface, QueryRunner } from 'typeorm';

/** Необов'язкова ціна за одиницю найменування — для сум договорів в аналітиці. */
export class ItemPrice1759700000000 implements MigrationInterface {
  name = 'ItemPrice1759700000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE order_items ADD COLUMN price numeric(16, 2) CHECK (price >= 0);
      CREATE INDEX contracts_expected_date_idx ON contracts (expected_delivery_date);
      CREATE INDEX deliveries_date_idx ON deliveries (date);
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX deliveries_date_idx;
      DROP INDEX contracts_expected_date_idx;
      ALTER TABLE order_items DROP COLUMN price;
    `);
  }
}
