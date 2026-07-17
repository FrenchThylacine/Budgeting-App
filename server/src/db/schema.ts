import type { NeonQueryFunction } from "@neondatabase/serverless";

export async function initializeSchema(
  sql: NeonQueryFunction<any, any>
): Promise<void> {

  await sql`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
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
      FOREIGN KEY (snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE
    );

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

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,


      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE,

      FOREIGN KEY(category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT
    );


    CREATE INDEX IF NOT EXISTS idx_activities_year
      ON activities(year_id);

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


    CREATE INDEX IF NOT EXISTS idx_spending_year
      ON spending_entries(year_id);

    CREATE INDEX IF NOT EXISTS idx_spending_month
      ON spending_entries(month);

    CREATE INDEX IF NOT EXISTS idx_spending_week
      ON spending_entries(week);

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

      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,


      FOREIGN KEY(year_id)
        REFERENCES years(id)
        ON DELETE CASCADE,

      FOREIGN KEY(category_id)
        REFERENCES categories(id)
        ON DELETE RESTRICT
    );


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


    CREATE INDEX IF NOT EXISTS idx_closed_months_year
      ON closed_months(year_id);
  `;


  await sql`
    CREATE TABLE IF NOT EXISTS budget_approvals (
      id TEXT PRIMARY KEY,

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


    CREATE INDEX IF NOT EXISTS idx_budget_approvals_year_month
      ON budget_approvals(year, month);
  `;


  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,

      snapshot_id TEXT NOT NULL,

      type TEXT NOT NULL,

      summary TEXT NOT NULL,

      metadata TEXT,

      created_at TEXT NOT NULL,


      FOREIGN KEY(snapshot_id)
        REFERENCES snapshots(id)
        ON DELETE CASCADE
    );


    CREATE INDEX IF NOT EXISTS idx_audit_log_snapshot
      ON audit_log(snapshot_id);


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


    CREATE INDEX IF NOT EXISTS idx_scenario_presets_snapshot
      ON scenario_presets(snapshot_id);
  `;
}