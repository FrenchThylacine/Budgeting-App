import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function runMigrations(
  sql: NeonQueryFunction<any, any>
): Promise<void> {

  // Create migrations tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;


  const migrations = [
    {
      name: "001-initial-schema",
      run: async (sql: NeonQueryFunction<any, any>) => {
        // Schema is created in schema.ts
        // This migration is only a checkpoint
      },
    },
    {
      name: "002-add-category-metadata",
      run: async (sql: NeonQueryFunction<any, any>) => {
        try {
          await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;`;
          await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;`;
          await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id TEXT;`;
        } catch (e) {
          console.error("Migration 002 error (might already exist):", e);
        }
      },
    },
    {
      name: "003-add-snapshot-revision",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;`;
      },
    },
    {
      name: "004-add-audit-historical-edit",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS historical_edit BOOLEAN NOT NULL DEFAULT false;`;
        await sql`ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS historical_period TEXT;`;
      },
    },
    {
      // Activity presentation and scheduling, wishlist links, and the
      // wishlist↔spending relationship. Without these the fields exist in the
      // client model but are silently dropped on the next server round-trip.
      name: "005-add-activity-schedule-and-wishlist-links",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS icon TEXT;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS color TEXT;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS cost_model TEXT;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS sessions_per_month DOUBLE PRECISION;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS weekdays TEXT;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS day_of_month INTEGER;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_date TEXT;`;

        await sql`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS url TEXT;`;
        await sql`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS color TEXT;`;
        await sql`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS linked_spending_id TEXT;`;

        await sql`ALTER TABLE spending_entries ADD COLUMN IF NOT EXISTS wishlist_item_id TEXT;`;
      },
    },
  ];


  for (const migration of migrations) {

    const result = await sql`
      SELECT 1
      FROM migrations
      WHERE name = ${migration.name};
    `;


    if ((result as any[]).length === 0) {

      await migration.run(sql);


      await sql`
        INSERT INTO migrations (name)
        VALUES (${migration.name});
      `;
    }
  }
}
