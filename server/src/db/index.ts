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

/**
 * Environment variables that may carry the connection string, most specific
 * first.
 *
 * `DATABASE_URL` is what this project documents, but the Neon and Vercel
 * Postgres integrations provision their own names — a project wired up through
 * the marketplace can end up with `POSTGRES_URL` and no `DATABASE_URL` at all.
 * Accepting the standard aliases turns a silent "database missing" into a
 * working connection.
 *
 * The pooled URLs come first: serverless functions open many short-lived
 * connections, which is exactly what a pooler is for.
 */
const CONNECTION_STRING_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

/** Which of the known variables are set. Names only — never values. */
export function connectionStringSources(): { name: string; present: boolean }[] {
  return CONNECTION_STRING_VARS.map((name) => ({
    name,
    present: typeof process.env[name] === "string" && process.env[name]!.trim().length > 0,
  }));
}

function resolveConnectionString(): { url: string; source: string } | null {
  for (const name of CONNECTION_STRING_VARS) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return { url: value.trim(), source: name };
    }
  }
  return null;
}

export function getDatabase(): SqlDriver {
  if (injected && sqlClient) return sqlClient;

  const resolved = resolveConnectionString();
  if (!resolved) {
    throw new Error(
      `No database connection string found. Set DATABASE_URL (or one of ${CONNECTION_STRING_VARS.slice(1).join(", ")}).`,
    );
  }

  if (!sqlClient) {
    sqlClient = neon(resolved.url) as unknown as SqlDriver;
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
