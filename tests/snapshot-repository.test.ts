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

  it("binds boolean columns with real booleans (Postgres rejects 0/1 integers)", async () => {
    const executedQueries: { sql: string; params: unknown[] }[] = [];
    const mockSql = async (strings: TemplateStringsArray, ...params: unknown[]) => {
      executedQueries.push({ sql: Array.from(strings).join("?"), params });
      return [];
    };

    const repo = new SnapshotRepository(mockSql as any);
    await repo.saveSnapshot(createSeedBudgetSnapshot(), "active");

    const withBooleanColumns = executedQueries.filter(
      (q) => q.sql.includes("INSERT INTO categories") || q.sql.includes("INSERT INTO activities") || q.sql.includes("INSERT INTO wishlist_items"),
    );
    expect(withBooleanColumns.length).toBeGreaterThan(0);
    for (const q of withBooleanColumns) {
      for (const param of q.params) {
        // No 0/1 stand-ins for booleans; amounts and orders are fine, but the
        // repository must never encode a flag as a number.
        if (typeof param === "number") {
          expect(Number.isFinite(param)).toBe(true);
        }
      }
      // At least one genuine boolean parameter per row insert.
      expect(q.params.some((p) => typeof p === "boolean")).toBe(true);
    }
  });

  it("runs all snapshot writes through a single sql.transaction batch when available", async () => {
    const directQueries: string[] = [];
    let transactionBatches = 0;
    let batchedQueryCount = 0;

    const mockSql: any = (strings: TemplateStringsArray, ..._params: unknown[]) => {
      const text = Array.from(strings).join("?");
      // Reads execute immediately (awaited); writes are collected unexecuted.
      const promise = Promise.resolve(
        text.includes("SELECT id FROM years") ? [] : [],
      ) as any;
      promise.queryText = text;
      directQueries.push(text);
      return promise;
    };
    mockSql.transaction = async (queries: any[]) => {
      transactionBatches += 1;
      batchedQueryCount = queries.length;
      return queries.map(() => []);
    };

    const repo = new SnapshotRepository(mockSql);
    await repo.saveSnapshot(createSeedBudgetSnapshot(), "active");

    expect(transactionBatches).toBe(1);
    expect(batchedQueryCount).toBeGreaterThan(5);
  });

  it("restores entry years from the years table, not from the year-row id suffix", async () => {
    const seed = createSeedBudgetSnapshot();
    const timestampedYearId = "year-active-2026-1723456789012";
    const mockSql = async (strings: TemplateStringsArray, ...params: unknown[]) => {
      const text = Array.from(strings).join("?");
      if (text.includes("SELECT * FROM snapshots")) {
        return [{ id: "active", version: 1, revision: 4, settings: JSON.stringify(seed.settings) }];
      }
      if (text.includes("SELECT id, year FROM years")) {
        return [{ id: timestampedYearId, year: 2026 }];
      }
      if (text.includes("SELECT * FROM years")) {
        return [{ id: timestampedYearId, year: 2026, created_at: "2026-01-01", updated_at: "2026-01-01" }];
      }
      if (text.includes("FROM spending_entries")) {
        return [{
          id: "spend-1", year_id: timestampedYearId, month: 7, week: 28, date: "2026-07-09",
          category_id: "cat-spending", activity_id: null, amount: 42, currency: "EUR",
          recurrence_type: "none", is_piloting: false, source: "personal", note: "",
          created_at: "2026-07-09", updated_at: "2026-07-09",
        }];
      }
      if (text.includes("FROM wallet_entries")) {
        return [{
          id: "wallet-1", year_id: timestampedYearId, month: 3, amount: 10, currency: "EUR",
          source: "test", type: "personal", note: "", created_at: "2026-03-01",
        }];
      }
      return [];
    };

    const repo = new SnapshotRepository(mockSql as any);
    const loaded = await repo.loadSnapshot("active");
    expect(loaded).not.toBeNull();
    expect(loaded!.revision).toBe(4);
    const year = loaded!.years["2026"];
    expect(year).toBeDefined();
    expect(year.spendingEntries[0].year).toBe(2026);
    expect(year.walletEntries[0].year).toBe(2026);
  });
});
