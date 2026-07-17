import { getDatabase } from "./db/index";
import type { BudgetSnapshot } from "@/domain/types";
import { SnapshotRepository } from "./repositories/SnapshotRepository";

/**
 * Migrate data from a JSON backup (exported from IndexedDB) into SQLite
 * Run this once to import existing user data into the new backend
 */
export async function migrateFromJsonBackup(jsonBackup: BudgetSnapshot): Promise<void> {
  const db = getDatabase();
  const repository = new SnapshotRepository(db);

  console.log("Starting migration from JSON backup...");

  // Validate the backup structure
  if (!jsonBackup || jsonBackup.version !== 1 || !jsonBackup.settings || !jsonBackup.years) {
    throw new Error("Invalid backup format. Expected BudgetSnapshot v1.");
  }

  try {
    repository.saveSnapshot(jsonBackup, "active");
    console.log("✓ Migration completed successfully");
    console.log(`  - Imported settings for year ${jsonBackup.settings.selectedYear}`);
    console.log(`  - Imported ${Object.keys(jsonBackup.years).length} year(s)`);
    console.log(`  - Imported ${jsonBackup.categories.length} categories`);
    console.log(`  - Imported ${jsonBackup.budgetApprovals.length} budget approvals`);
    console.log(`  - Imported ${jsonBackup.auditLog.length} audit log entries`);
  } catch (error) {
    console.error("✗ Migration failed:", error);
    throw error;
  }
}

/**
 * Helper function to load a JSON file and migrate it
 * Usage: npx tsx src/migrate.ts <path-to-backup.json>
 */
async function main() {
  const jsonPath = process.argv[2];

  if (!jsonPath) {
    console.error("Usage: npx tsx src/migrate.ts <path-to-backup.json>");
    process.exit(1);
  }

  const fs = await import("fs").then((m) => m.default || m);
  const backup = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

  migrateFromJsonBackup(backup)
    .then(() => {
      console.log("Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

