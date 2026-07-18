import type { BudgetSnapshot } from "@/domain/types";
import { SnapshotRepository } from "../repositories/SnapshotRepository";
import { getDatabase } from "../db";

export class BudgetService {
  private repository: SnapshotRepository;

  constructor(sql = getDatabase()) {
    this.repository = new SnapshotRepository(sql);
  }

  /**
   * Load the active budget snapshot
   */
  async loadSnapshot(): Promise<BudgetSnapshot | null> {
    return await this.repository.loadSnapshot("active");
  }

  /**
   * Save the full budget snapshot (with all nested entities)
   */
  async saveSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    await this.repository.saveSnapshot(snapshot, "active");
  }

  /**
   * Update only the settings (top-level configuration)
   */
  async updateSettings(snapshot: BudgetSnapshot, patch: Partial<any>): Promise<BudgetSnapshot> {
    snapshot.settings = { ...snapshot.settings, ...patch };
    snapshot.settings.lastUpdated = new Date().toISOString();
    await this.saveSnapshot(snapshot);
    return snapshot;
  }

  /**
   * Get the active snapshot or throw if not found
   */
  async getOrThrow(): Promise<BudgetSnapshot> {
    const snapshot = await this.loadSnapshot();
    if (!snapshot) {
      throw new Error("No active budget snapshot found. Initialize the app first.");
    }
    return snapshot;
  }
}
