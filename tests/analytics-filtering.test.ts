/**
 * Analytics filtering regression tests.
 *
 * Verifies that the period-aware entry filtering logic used by AnalyticsPanel
 * correctly isolates entries for month / week / year modes, handles
 * piloting exclusions, and computes recurring vs non-recurring splits.
 */

import { describe, expect, it } from "vitest";
import { normalizeEntry } from "../src/domain/calculations";
import { entriesForSelectedPeriod } from "../src/domain/analytics";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function entry(overrides: Partial<SpendingEntry>): SpendingEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    year: 2026,
    month: 7,
    week: 28,
    date: "2026-07-09",
    categoryId: "cat-spending",
    amount: 100,
    currency: "EUR",
    recurrenceType: "none",
    isPiloting: false,
    note: "",
    createdAt: "2026-07-09T00:00:00Z",
    updatedAt: "2026-07-09T00:00:00Z",
    ...overrides,
  };
}

function snapshotWith(entries: SpendingEntry[]): BudgetSnapshot {
  const snap = createSeedBudgetSnapshot();
  const record = snap.years["2026"] ?? {
    year: 2026,
    activities: [],
    spendingEntries: [],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  record.spendingEntries = entries;
  snap.years["2026"] = record;
  return snap;
}

// ─── Delegates to the shared selector used by Dashboard and Analytics ────────

function filterForMode(
  snapshot: BudgetSnapshot,
  mode: "month" | "week" | "year",
): SpendingEntry[] {
  return entriesForSelectedPeriod(snapshot, { ...snapshot.settings, selectedPeriodMode: mode });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("analytics period filtering", () => {
  it("month mode: only returns entries for selected year+month", () => {
    const snap = snapshotWith([
      entry({ year: 2026, month: 7, amount: 50 }),
      entry({ year: 2026, month: 6, amount: 99 }), // different month
      entry({ year: 2025, month: 7, amount: 77 }), // different year
    ]);
    snap.settings.selectedPeriodMode = "month";
    snap.settings.selectedYear = 2026;
    snap.settings.selectedMonth = 7;

    const result = filterForMode(snap, "month");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(50);
  });

  it("year mode: returns all entries for selected calendar year across months", () => {
    const snap = snapshotWith([
      entry({ year: 2026, month: 1, amount: 10 }),
      entry({ year: 2026, month: 6, amount: 20 }),
      entry({ year: 2026, month: 12, amount: 30 }),
      entry({ year: 2025, month: 7, amount: 99 }), // excluded
    ]);
    snap.settings.selectedPeriodMode = "year";
    snap.settings.selectedYear = 2026;

    const result = filterForMode(snap, "year");
    expect(result).toHaveLength(3);
    const total = result.reduce((s, e) => s + e.amount, 0);
    expect(total).toBe(60);
  });

  it("week mode: returns entries for selected ISO week", () => {
    // Week 28 of 2026 starts on Mon 2026-07-06
    const snap = snapshotWith([
      entry({ year: 2026, month: 7, week: 28, date: "2026-07-09", amount: 42 }),
      entry({ year: 2026, month: 7, week: 29, date: "2026-07-13", amount: 55 }), // different week
    ]);
    snap.settings.selectedPeriodMode = "week";
    snap.settings.selectedYear = 2026;
    snap.settings.selectedWeek = 28;
    snap.settings.selectedWeekYear = 2026;

    const result = filterForMode(snap, "week");
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(42);
  });

  it("month mode: zero-amount entry is kept and contributes 0 to total (not missing)", () => {
    const snap = snapshotWith([
      entry({ year: 2026, month: 7, amount: 0 }),
    ]);
    snap.settings.selectedPeriodMode = "month";
    snap.settings.selectedYear = 2026;
    snap.settings.selectedMonth = 7;

    const result = filterForMode(snap, "month");
    expect(result).toHaveLength(1);
    const total = result.reduce((s, e) => s + normalizeEntry(e, snap), 0);
    expect(total).toBe(0); // 0 is a valid recorded value, not missing
  });

  it("piloting entries are included in raw filter but can be excluded from normalTotal", () => {
    const snap = snapshotWith([
      entry({ year: 2026, month: 7, amount: 100, isPiloting: false, categoryId: "cat-spending" }),
      entry({ year: 2026, month: 7, amount: 200, isPiloting: true, categoryId: "cat-piloting" }),
    ]);
    // Give the piloting category the right bucket
    snap.categories.push({
      id: "cat-piloting",
      name: "Piloting",
      bucket: "piloting",
      color: "#0000ff",
    });
    snap.settings.selectedPeriodMode = "month";
    snap.settings.selectedYear = 2026;
    snap.settings.selectedMonth = 7;

    const all = filterForMode(snap, "month");
    expect(all).toHaveLength(2);

    const catMap = new Map(snap.categories.map((c) => [c.id, c]));
    const normalTotal = all
      .filter((e) => catMap.get(e.categoryId)?.bucket !== "piloting")
      .reduce((s, e) => s + normalizeEntry(e, snap), 0);
    const pilotTotal = all
      .filter((e) => catMap.get(e.categoryId)?.bucket === "piloting")
      .reduce((s, e) => s + normalizeEntry(e, snap), 0);

    expect(normalTotal).toBe(100);
    expect(pilotTotal).toBe(200);
  });

  it("recurring vs non-recurring split is accurate", () => {
    const RECURRING_TYPES = new Set(["weekly", "monthly", "yearly", "session"]);
    const snap = snapshotWith([
      entry({ year: 2026, month: 7, amount: 50, recurrenceType: "monthly" }),
      entry({ year: 2026, month: 7, amount: 30, recurrenceType: "weekly" }),
      entry({ year: 2026, month: 7, amount: 20, recurrenceType: "none" }),
      entry({ year: 2026, month: 7, amount: 10, recurrenceType: "purchase" }),
    ]);
    snap.settings.selectedPeriodMode = "month";
    snap.settings.selectedYear = 2026;
    snap.settings.selectedMonth = 7;

    const entries = filterForMode(snap, "month");
    let rec = 0;
    let nonRec = 0;
    for (const e of entries) {
      const n = normalizeEntry(e, snap);
      if (RECURRING_TYPES.has(e.recurrenceType)) rec += n;
      else nonRec += n;
    }

    expect(rec).toBe(80); // 50 + 30
    expect(nonRec).toBe(30); // 20 + 10
    expect(rec + nonRec).toBe(110); // total matches
  });

  it("year mode: cross-month total sums all months correctly", () => {
    const snap = snapshotWith(
      Array.from({ length: 12 }, (_, i) =>
        entry({ year: 2026, month: i + 1, amount: 100 }),
      ),
    );
    snap.settings.selectedPeriodMode = "year";
    snap.settings.selectedYear = 2026;

    const result = filterForMode(snap, "year");
    expect(result).toHaveLength(12);
    const total = result.reduce((s, e) => s + normalizeEntry(e, snap), 0);
    expect(total).toBe(1200);
  });
});
