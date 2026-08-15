import type { BudgetSnapshot } from "../../../src/domain/types.js";
import { SnapshotRepository } from "../repositories/SnapshotRepository.js";
import { getDatabase } from "../db/index.js";

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
   * Read the stored revision counter for optimistic-concurrency checks.
   * Returns null when no snapshot exists yet.
   */
  async loadRevision(): Promise<number | null> {
    return await this.repository.loadRevision("active");
  }

  /**
   * Persist a change made by the server itself (the granular REST routes rather
   * than a client snapshot PUT). The revision is bumped so the change takes
   * part in the same optimistic-concurrency protocol; otherwise a client
   * holding the previous revision could overwrite it without a conflict.
   */
  async commitServerChange(snapshot: BudgetSnapshot): Promise<void> {
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await this.saveSnapshot(snapshot);
  }

  /**
   * Update only the settings (top-level configuration)
   */
  async updateSettings(snapshot: BudgetSnapshot, patch: Partial<any>): Promise<BudgetSnapshot> {
    snapshot.settings = { ...snapshot.settings, ...patch };
    snapshot.settings.lastUpdated = new Date().toISOString();
    snapshot.revision = (snapshot.revision ?? 0) + 1;
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
