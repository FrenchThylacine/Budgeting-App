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
    {
      // Make the data model safe for more than one budget in the same database.
      //
      // Two defects made that impossible, and both corrupt data rather than
      // merely leaking it:
      //
      //   1. `budget_approvals` had no owner column, and the repository read it
      //      with `SELECT * FROM budget_approvals` — no WHERE clause. Every
      //      budget would load every other budget's approvals, which this
      //      project treats as permanent historical records.
      //
      //   2. The seed hardcoded its row ids (`cat-health`, `act-gym`, `wish-1`,
      //      …). Those are primary keys in tables shared by all budgets, so the
      //      second budget created collided with the first on every seeded row,
      //      and `ON CONFLICT (id) DO UPDATE` overwrote the existing row's
      //      contents while leaving `snapshot_id` pointing at the original
      //      owner. The seed now generates ids per budget, and `seed_key`
      //      carries the stable identity the application matches on.
      name: "006-tenant-isolation",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE budget_approvals ADD COLUMN IF NOT EXISTS snapshot_id TEXT;`;

        // Everything written before this point belongs to the single budget
        // that existed, which the application has always called "active".
        await sql`UPDATE budget_approvals SET snapshot_id = 'active' WHERE snapshot_id IS NULL;`;

        await sql`
          CREATE INDEX IF NOT EXISTS idx_budget_approvals_snapshot
            ON budget_approvals(snapshot_id);
        `;

        await sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS seed_key TEXT;`;

        // Rows written by the old seed carry the key value as their id, so the
        // backfill is exact rather than a guess. The id list is spelled out
        // instead of matched with LIKE 'cat-%' because user-created categories
        // use that same prefix and must not be labelled as seeded.
        await sql`
          UPDATE categories
          SET seed_key = id
          WHERE seed_key IS NULL
            AND id IN (
              'cat-health', 'cat-learning', 'cat-piloting', 'cat-utilities',
              'cat-software', 'cat-tech', 'cat-other', 'cat-spending',
              'cat-wallet', 'cat-wishlist'
            );
        `;
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

      // "Check then insert" is a race: two workers can both read no row and
      // both insert, and the loser crashes on the unique constraint — which
      // takes the whole API down with a 503, not just the migration. This is
      // not hypothetical on serverless, where several instances boot at once.
      //
      // ON CONFLICT makes the bookkeeping idempotent. Re-running a migration
      // body is harmless because every one of them is written with
      // IF NOT EXISTS, so losing the race costs a little duplicated work and
      // nothing else.
      await sql`
        INSERT INTO migrations (name)
        VALUES (${migration.name})
        ON CONFLICT (name) DO NOTHING;
      `;
    }
  }
}
