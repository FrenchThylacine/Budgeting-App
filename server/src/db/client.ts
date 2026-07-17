import { neon } from "@neondatabase/serverless";

let sql: ReturnType<typeof neon> | null = null;

export function getDatabase() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL missing");
    }

    sql = neon(process.env.DATABASE_URL);
  }

  return sql;
}