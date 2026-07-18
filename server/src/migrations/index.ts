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
  ];


  for (const migration of migrations) {

    const result = await sql`
      SELECT 1
      FROM migrations
      WHERE name = ${migration.name};
    `;


    if (result.length === 0) {

      await migration.run(sql);


      await sql`
        INSERT INTO migrations (name)
        VALUES (${migration.name});
      `;
    }
  }
}
