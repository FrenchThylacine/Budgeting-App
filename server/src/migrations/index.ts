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
      run: async () => {
        // Schema is created in schema.ts
        // This migration is only a checkpoint
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

      await migration.run();


      await sql`
        INSERT INTO migrations (name)
        VALUES (${migration.name});
      `;
    }
  }
}
