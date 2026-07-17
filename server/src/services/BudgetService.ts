import type { BudgetSnapshot } from "@/domain/types";
import { SnapshotRepository } from "../repositories/SnapshotRepository";
import Database from "better-sqlite3";

export class BudgetService {
  private repository: SnapshotRepository;

  constructor(db: Database.Database) {
    this.repository = new SnapshotRepository(db);
  }

  /**
   * Load the active budget snapshot
   */
  loadSnapshot(): BudgetSnapshot | null {
    return this.repository.loadSnapshot("active");
  }

  /**
   * Save the full budget snapshot (with all nested entities)
   */
  saveSnapshot(snapshot: BudgetSnapshot): void {
    this.repository.saveSnapshot(snapshot, "active");
  }

  /**
   * Update only the settings (top-level configuration)
   */
  updateSettings(snapshot: BudgetSnapshot, patch: Partial<any>): BudgetSnapshot {
    snapshot.settings = { ...snapshot.settings, ...patch };
    snapshot.settings.lastUpdated = new Date().toISOString();
    this.saveSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Get the active snapshot or throw if not found
   */
  getOrThrow(): BudgetSnapshot {
    const snapshot = this.loadSnapshot();
    if (!snapshot) {
      throw new Error("No active budget snapshot found. Initialize the app first.");
    }
    return snapshot;
  }
}
