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

export async function initializeDatabase() {
  if (initialized) return;

  const sql = getDatabase();

  await initializeSchema(sql as never);
  await runMigrations(sql as never);

  initialized = true;
}

export function closeDatabase() {
  if (!injected) sqlClient = null;
  initialized = false;
}
