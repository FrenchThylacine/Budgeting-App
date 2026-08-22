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
    {
      // Accounts, sessions, password resets, and the rate-limit ledger.
      //
      // These tables are defined here and NOT in schema.ts. Every other table
      // is declared in both, which is how migration 006 shipped an index over a
      // column that did not exist yet: schema.ts runs first, so it saw the old
      // shape of an existing database. A table that lives in exactly one place
      // cannot drift, and a brand-new table has no reason to be in two.
      name: "007-authentication",
      run: async (sql: NeonQueryFunction<any, any>) => {
        // `email` keeps what the user typed, for display and for addressing
        // mail. `email_normalized` is what uniqueness and lookup use, so
        // Alice@ and alice@ cannot become two accounts.
        await sql`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            email_normalized TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            snapshot_id TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `;

        // Only the SHA-256 of a session token is stored, so a database dump
        // yields no usable session. ON DELETE CASCADE means deleting an account
        // cannot leave a session that still authenticates.
        await sql`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);`;
        await sql`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);`;

        await sql`
          CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);`;

        // Rate limiting lives in the database because serverless instances
        // share no memory: an in-process counter resets on every cold start and
        // is per-instance besides, so it would cap nothing under the traffic it
        // exists to stop.
        await sql`
          CREATE TABLE IF NOT EXISTS auth_attempts (
            id TEXT PRIMARY KEY,
            bucket TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_auth_attempts_bucket ON auth_attempts(bucket, created_at);`;
      },
    },
    {
      // One-off exceptions to a recurring schedule: a week skipped, a lesson
      // moved, an extra session, a different price once.
      //
      // Without persistence the field would exist in the client model and be
      // dropped on the next server round-trip — the failure mode migration 005
      // exists to fix, because the repository writes a fixed column list.
      name: "008-schedule-overrides",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS schedule_overrides TEXT;`;
      },
    },
    {
      // Where a wishlist item's visual identity comes from, separately from
      // where it is bought. One field could not carry both: the shop's favicon
      // makes every item from that shop look identical, and pointing the link
      // at the manufacturer sends the user somewhere they cannot buy.
      name: "009-wishlist-brand-url",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS brand_url TEXT;`;
      },
    },
    {
      // A library icon for a wishlist item, for the common case where the site
      // has no usable favicon — or returns a generic placeholder that renders
      // as something indistinguishable from a broken image.
      name: "010-wishlist-icon",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS icon TEXT;`;
      },
    },
    {
      /*
       * Notes against a month.
       *
       * `YearRecord.monthlyNotes` has been in the type since the beginning and
       * the loader returned a hardcoded `{}` for it, so anything written was
       * lost on the next read from the server. A note explaining why a month
       * cost what it did is the one thing that still makes sense of the figure
       * a year later, so it is stored rather than the type being deleted.
       *
       * JSONB on the year row rather than a table of its own: there are at
       * most twelve per year, they are always read with the year and never
       * queried across years, and a table would add a join and a delete pass
       * for no gain. `DEFAULT '{}'` so every existing row is immediately
       * valid without a backfill.
       */
      name: "011-monthly-notes",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE years ADD COLUMN IF NOT EXISTS monthly_notes JSONB NOT NULL DEFAULT '{}'::jsonb;`;
      },
    },
    {
      /*
       * A renewal date the user knows and the recurrence rule cannot derive —
       * an annual subscription renews on the day it was bought. Display-only:
       * it overrides the next date in the upcoming timeline and never touches
       * a cost, which is why it is a plain date column and not part of the
       * schedule.
       */
      name: "012-activity-next-renewal",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS next_renewal_date TEXT;`;
      },
    },
    {
      /*
       * Payment cycles, and a shared visual identity.
       *
       * `sessions_per_period` / `session_period` / `sessions_per_payment` carry
       * the session-pack model: how often the activity happens, and how often
       * it is paid for. Those are two different facts and the schema now has
       * two different places for them — treating "twice a week" as "twice a
       * week's worth of payments" is the error the model exists to prevent.
       *
       * `icon_url` and `icon_source_url` give an activity the same identity
       * options a wishlist item has had since migrations 009 and 010: a direct
       * image, or a website to take the icon from, kept separate from any link
       * that means "where this is bought".
       *
       * Every column is additive and nullable, so an existing row is valid the
       * moment it is added and no backfill is required. Nothing in `schema.ts`
       * references them, per the rule migration 006 established the hard way.
       */
      name: "013-payment-cycles-and-icons",
      run: async (sql: NeonQueryFunction<any, any>) => {
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS sessions_per_period DOUBLE PRECISION;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS session_period TEXT;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS sessions_per_payment DOUBLE PRECISION;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS icon_url TEXT;`;
        await sql`ALTER TABLE activities ADD COLUMN IF NOT EXISTS icon_source_url TEXT;`;

        await sql`ALTER TABLE wishlist_items ADD COLUMN IF NOT EXISTS icon_url TEXT;`;
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
