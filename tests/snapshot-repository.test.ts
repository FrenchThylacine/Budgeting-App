import { describe, it, expect, vi } from "vitest";
import { SnapshotRepository } from "../server/src/repositories/SnapshotRepository";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";

describe("SnapshotRepository safe persistence", () => {
  it("uses targeted UPSERT and selective NOT IN deletion when saving snapshot", async () => {
    const executedQueries: { sql: string; params: unknown[] }[] = [];
    const mockSql = async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const sqlString = Array.from(strings).join("?");
      executedQueries.push({ sql: sqlString, params });
      if (sqlString.includes("SELECT * FROM snapshots")) {
        return [{ id: "active", version: 1, settings: JSON.stringify(createSeedBudgetSnapshot().settings) }];
      }
      if (sqlString.includes("SELECT id FROM years")) {
        return [{ id: "year-active-2026-1" }];
      }
      return [];
    };

    const repo = new SnapshotRepository(mockSql as any);
    const snapshot = createSeedBudgetSnapshot();
    await repo.saveSnapshot(snapshot, "active");

    // Ensure no broad "DELETE FROM activities WHERE year_id = $1" exists without NOT IN
    const activityDeletes = executedQueries.filter((q) => q.sql.includes("DELETE FROM activities"));
    expect(activityDeletes.length).toBeGreaterThan(0);
    activityDeletes.forEach((q) => {
      expect(q.sql).toContain("id NOT IN");
    });

    const spendingDeletes = executedQueries.filter((q) => q.sql.includes("DELETE FROM spending_entries"));
    expect(spendingDeletes.length).toBeGreaterThan(0);
    spendingDeletes.forEach((q) => {
      expect(q.sql).toContain("id NOT IN");
    });

    const wishlistDeletes = executedQueries.filter((q) => q.sql.includes("DELETE FROM wishlist_items"));
    expect(wishlistDeletes.length).toBeGreaterThan(0);
    wishlistDeletes.forEach((q) => {
      expect(q.sql).toContain("id NOT IN");
    });
  });
});
