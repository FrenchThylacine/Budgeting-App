import Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  // Check if migrations table exists; if not, we're starting fresh
  const migrationsTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'")
    .get();

  if (!migrationsTableExists) {
    db.exec(`
      CREATE TABLE migrations (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        executed_at TEXT NOT NULL
      );
    `);
  }

  // List of migrations to run (in order)
  const migrations = [
    {
      name: "001-initial-schema",
      run: () => {
        // Schema is already initialized in schema.ts
        // This migration just serves as a checkpoint
      },
    },
  ];

  for (const migration of migrations) {
    const executed = db
      .prepare("SELECT 1 FROM migrations WHERE name = ?")
      .get(migration.name);

    if (!executed) {
      migration.run();
      db.prepare("INSERT INTO migrations (name, executed_at) VALUES (?, datetime('now'))").run(
        migration.name,
      );
    }
  }
}
