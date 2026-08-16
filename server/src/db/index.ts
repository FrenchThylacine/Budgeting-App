import { neon } from "@neondatabase/serverless";
import { initializeSchema } from "./schema.js";
import { runMigrations } from "../migrations/index.js";

/**
 * The minimal driver surface the repository layer depends on: a tagged-template
 * query function, optionally exposing `transaction([...])` for atomic batches.
 * The Neon serverless driver satisfies this; so does a thin node-postgres
 * adapter, which is how local development and integration tests run against a
 * plain PostgreSQL server (Neon's driver speaks HTTP to Neon only).
 */
export type SqlDriver = ((strings: TemplateStringsArray, ...params: unknown[]) => unknown) & {
  transaction?: (queries: unknown[]) => Promise<unknown>;
};

let sqlClient: SqlDriver | null = null;
let injected = false;
let initialized = false;
/**
 * The in-flight initialization, shared by every concurrent caller.
 *
 * A plain boolean is not enough: it is only set *after* the awaits finish, so
 * the server's startup call and the first HTTP request both saw `false`, both
 * ran the migrations, and the loser crashed on the migrations table's unique
 * constraint — surfacing as a 503 and an "offline" badge in the UI.
 */
let initPromise: Promise<void> | null = null;

/**
 * Inject a driver instead of connecting to Neon. Intended for integration tests
 * and local development against a standard PostgreSQL server. Passing null
 * restores the default Neon behaviour.
 */
export function setDatabase(driver: SqlDriver | null): void {
  sqlClient = driver;
  injected = driver != null;
  initialized = false;
}

export function getDatabase(): SqlDriver {
  if (injected && sqlClient) return sqlClient;

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL) as unknown as SqlDriver;
  }

  return sqlClient;
}

export async function initializeDatabase(): Promise<void> {
  if (initialized) return;
  // Concurrent callers await the same run instead of starting their own.
  if (initPromise) return initPromise;

  const sql = getDatabase();

  initPromise = (async () => {
    await initializeSchema(sql as never);
    await runMigrations(sql as never);
    initialized = true;
  })();

  try {
    await initPromise;
  } finally {
    // Cleared either way: on success `initialized` short-circuits future
    // calls, and on failure the next request gets a fresh attempt rather than
    // being stuck awaiting a promise that already rejected.
    initPromise = null;
  }
}

export function closeDatabase() {
  if (!injected) sqlClient = null;
  initialized = false;
  initPromise = null;
}
