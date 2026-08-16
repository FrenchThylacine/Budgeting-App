import type { NeonQueryFunction } from "@neondatabase/serverless";

// The Neon HTTP driver executes exactly one SQL command per call, so every
// statement below must stay in its own template. Grouping several commands in
// one template fails at runtime against a real Neon database.
//
// Not here: the authentication tables (`users`, `sessions`,
// `password_reset_tokens`, `auth_attempts`). They are declared once, in
// migration 007. This file runs BEFORE the migrations and must therefore
// describe only what an already-deployed database is guaranteed to have.
export async function initializeSchema(
  sql: NeonQueryFunction<any, any>
): Promise<void> {

  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      settings TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      bucket TEXT NOT NULL,
      color TEXT NOT NULL,
      monthly_cap DOUBLE PRECISION,
      notes TEXT,
      archived BOOLEAN DEFAULT false,
      icon TEXT,
      description TEXT,
      parent_id TEXT,
      -- Stable identity of a seeded category, independent of its row id. Row
      -- ids are generated per budget so two budgets cannot collide on this
      -- table's primary key; anything that needs "the wishlist category"
      -- matches on this instead.
      seed_key TEXT,
      FOREIGN KEY (snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_categories_snapshot
      ON categories(snapshot_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS years (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE,
      UNIQUE(snapshot_id, year)
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_years_snapshot
      ON years(snapshot_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      year_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      recurrence_type TEXT NOT NULL,
      recurrence_interval INTEGER NOT NULL,
      price_per_session DOUBLE PRECISION,
      price_per_purchase DOUBLE PRECISION,
      price_per_month DOUBLE PRECISION,
      estimated_cost DOUBLE PRECISION,
      yearly_estimate DOUBLE PRECISION,
      active BOOLEAN NOT NULL,
      visible BOOLEAN NOT NULL,
      seasonal_tag TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      notes TEXT,
      icon TEXT,
      color TEXT,
      cost_model TEXT,
      sessions_per_month DOUBLE PRECISION,
      weekdays TEXT,
      day_of_month INTEGER,
      start_date TEXT,
      -- One-off exceptions to the recurring rule, as a JSON array. Safe to
      -- declare here as well as in migration 008: nothing in this file
      -- references it, so an existing database that lacks it is unaffected.
      schedule_overrides TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE,
      FOREIGN KEY(category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_activities_year
      ON activities(year_id);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_activities_category
      ON activities(category_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS spending_entries (
      id TEXT PRIMARY KEY,
      year_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      week INTEGER NOT NULL,
      date TEXT NOT NULL,
      category_id TEXT NOT NULL,
      activity_id TEXT,
      amount DOUBLE PRECISION NOT NULL,
      currency TEXT NOT NULL,
      recurrence_type TEXT NOT NULL,
      is_piloting BOOLEAN NOT NULL DEFAULT false,
      source TEXT NOT NULL DEFAULT 'personal',
      note TEXT,
      wishlist_item_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE,
      FOREIGN KEY(category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT,
      FOREIGN KEY(activity_id)
        REFERENCES activities(id)
        ON DELETE SET NULL
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_spending_year
      ON spending_entries(year_id);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_spending_month
      ON spending_entries(month);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_spending_week
      ON spending_entries(week);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_spending_category
      ON spending_entries(category_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id TEXT PRIMARY KEY,
      year_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      actual_price DOUBLE PRECISION,
      effective_value DOUBLE PRECISION,
      currency TEXT NOT NULL,
      bought BOOLEAN NOT NULL,
      in_wishlist BOOLEAN NOT NULL,
      priority TEXT NOT NULL,
      date_added TEXT NOT NULL,
      date_purchased TEXT,
      notes TEXT,
      active BOOLEAN NOT NULL,
      url TEXT,
      color TEXT,
      linked_spending_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE,
      FOREIGN KEY(category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wishlist_year
      ON wishlist_items(year_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS wallet_entries (
      id TEXT PRIMARY KEY,
      year_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      currency TEXT NOT NULL,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_wallet_year
      ON wallet_entries(year_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS closed_months (
      id TEXT PRIMARY KEY,
      year_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      status TEXT NOT NULL,
      spend_total DOUBLE PRECISION,
      delta DOUBLE PRECISION,
      rollover_wallet_entry_id TEXT,
      confirmed_at TEXT NOT NULL,
      note TEXT,
      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE,
      UNIQUE(year_id, month)
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_closed_months_year
      ON closed_months(year_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS budget_approvals (
      id TEXT PRIMARY KEY,
      -- Every other child table carries its owner. This one did not, and
      -- loadBudgetApprovals() read it with no WHERE clause at all, so a second
      -- budget in the same database would see the first one's approved budgets
      -- — which the project treats as permanent financial records.
      snapshot_id TEXT,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      suggested_amount DOUBLE PRECISION NOT NULL,
      approved_amount DOUBLE PRECISION,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      recurring_total DOUBLE PRECISION NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT NOT NULL
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_budget_approvals_year_month
      ON budget_approvals(year, month);
  `;

  // The index on snapshot_id deliberately lives in migration 006, not here.
  //
  // This function runs BEFORE the migrations, and every statement in it is
  // written so that an existing database is left alone. On such a database
  // `CREATE TABLE IF NOT EXISTS budget_approvals` does nothing, so the column
  // added by 006 does not exist yet — and indexing it here fails with
  // `column "snapshot_id" does not exist` (SQLSTATE 42703), which aborts
  // initialization and answers every request with 503.
  //
  // Rule for anything added later: a column introduced by a migration may only
  // be referenced by that migration or a later one, never by this file.

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      metadata TEXT,
      historical_edit BOOLEAN NOT NULL DEFAULT false,
      historical_period TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_log_snapshot
      ON audit_log(snapshot_id);
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_log_created
      ON audit_log(created_at);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS seasonal_presets (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      season TEXT NOT NULL,
      activity_overrides TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY(snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_seasonal_presets_snapshot
      ON seasonal_presets(snapshot_id);
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scenario_presets (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      name TEXT NOT NULL,
      monthly_budget DOUBLE PRECISION,
      pilot_included_in_budget BOOLEAN,
      category_caps TEXT,
      notes TEXT,
      FOREIGN KEY(snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE
    );
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_scenario_presets_snapshot
      ON scenario_presets(snapshot_id);
  `;
}
