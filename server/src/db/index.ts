import { neon } from "@neondatabase/serverless";
import { initializeSchema } from "./schema";
import { runMigrations } from "../migrations";

let sqlClient: ReturnType<typeof neon> | null = null;
let initialized = false;


export function getDatabase() {

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }

  return sqlClient;
}


export async function initializeDatabase() {

  if (initialized) return;

  const sql = getDatabase();

  await initializeSchema(sql);
  await runMigrations(sql);

  initialized = true;
}


export function closeDatabase() {
  sqlClient = null;
  initialized = false;
}