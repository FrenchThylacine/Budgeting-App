import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { initializeSchema } from "./schema";
import { runMigrations } from "../migrations/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "../../../data/budget.db");

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
    runMigrations(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function resetDatabase(): void {
  closeDatabase();
  try {
    require("fs").unlinkSync(DB_PATH);
  } catch {
    // File may not exist yet
  }
}
