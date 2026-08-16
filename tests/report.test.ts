/**
 * Period reports. A printed report is a record the user may act on, so the
 * same rules apply as on screen: figures come from the shared selectors, and a
 * period with no data must never be printed as a confident zero.
 */

import { describe, expect, it } from "vitest";
import { buildPeriodReport, reportHtml } from "../src/domain/report";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { catId } from "./helpers/seedIds";
import { formatMoney } from "../src/domain/currency";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";

const NOW = new Date("2026-08-15T12:00:00Z");

function entry(overrides: Partial<SpendingEntry>): SpendingEntry {
  return {
    id: `e-${Math.random().toString(36).slice(2)}`,
    year: 2026,
    month: 8,
    week: 33,
    date: "2026-08-10",
    categoryId: "cat-spending",
    amount: 100,
    currency: "EUR",
    recurrenceType: "none",
    isPiloting: false,
    note: "",
    createdAt: "2026-08-10T00:00:00Z",
    updatedAt: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

function snapshotWith(entries: SpendingEntry[]): BudgetSnapshot {
  const snap = createSeedBudgetSnapshot(NOW);
  snap.years["2026"].spendingEntries = entries;
  snap.settings.selectedYear = 2026;
  snap.settings.selectedMonth = 8;
  snap.settings.baseCurrency = "EUR";
  return snap;
}

const money = (snap: BudgetSnapshot) => (value: number) =>
  formatMoney(value, snap.settings.baseCurrency, snap.settings.currencyDisplayMode);

describe("buildPeriodReport", () => {
  it("reports the selected month", () => {
    const snap = snapshotWith([entry({ amount: 120 }), entry({ amount: 80 })]);
    const report = buildPeriodReport(snap, "month", NOW);

    expect(report.title).toBe("August 2026");
    expect(report.subtitle).toBe("Monthly financial report");
    const total = report.summary.find((s) => s.label === "Total spending")!;
    expect(total.value).toContain("200");
    expect(report.summary.find((s) => s.label === "Transactions")!.value).toBe("2");
  });

  it("reports the whole year when scoped to year", () => {
    const snap = snapshotWith([
      entry({ month: 3, amount: 50, date: "2026-03-10" }),
      entry({ month: 8, amount: 70, date: "2026-08-10" }),
    ]);
    const report = buildPeriodReport(snap, "year", NOW);

    expect(report.title).toBe("2026");
    expect(report.summary.find((s) => s.label === "Total spending")!.value).toContain("120");
  });

  it("says a period has no data instead of printing a zero", () => {
    const snap = snapshotWith([]);
    const report = buildPeriodReport(snap, "month", NOW);

    expect(report.summary.find((s) => s.label === "Total spending")!.value).toBe("No data recorded");
    expect(report.notes.some((n) => n.includes("not as zero"))).toBe(true);
  });

  it("keeps a real zero distinct from missing", () => {
    const snap = snapshotWith([entry({ amount: 0 })]);
    const report = buildPeriodReport(snap, "month", NOW);
    expect(report.summary.find((s) => s.label === "Total spending")!.value).not.toBe("No data recorded");
  });

  it("leaves months with no records as null in the trend", () => {
    const snap = snapshotWith([entry({ month: 8, amount: 100 })]);
    const report = buildPeriodReport(snap, "month", NOW);

    expect(report.monthly[7].value).toBe(100); // August
    expect(report.monthly[0].value).toBeNull(); // January — unknown, not zero
  });

  it("flags categories over their cap", () => {
    const snap = snapshotWith([entry({ amount: 300, categoryId: "cat-capped" })]);
    snap.categories.push({
      id: "cat-capped",
      name: "Capped",
      bucket: "general",
      color: "#ff0000",
      monthlyCap: 100,
    });
    const report = buildPeriodReport(snap, "month", NOW);
    expect(report.notes.some((n) => n.includes("exceeded the monthly cap"))).toBe(true);
  });

  it("notes that piloting is excluded from shares", () => {
    // Resolved against this snapshot: seed ids are generated per budget, so a
    // second snapshotWith() call would produce ids that do not exist here.
    const snap = snapshotWith([]);
    snap.years["2026"].spendingEntries = [
      entry({ amount: 100, categoryId: catId(snap, "cat-piloting"), isPiloting: true }),
    ];
    const report = buildPeriodReport(snap, "month", NOW);
    expect(report.notes.some((n) => n.includes("Piloting"))).toBe(true);
  });

  it("does not mutate the snapshot it reports on", () => {
    const snap = snapshotWith([entry({ amount: 100 })]);
    const before = JSON.stringify(snap);
    buildPeriodReport(snap, "year", NOW);
    expect(JSON.stringify(snap)).toBe(before);
  });
});

describe("reportHtml", () => {
  it("produces a self-contained printable document", () => {
    const snap = snapshotWith([entry({ amount: 100 })]);
    const html = reportHtml(buildPeriodReport(snap, "month", NOW), money(snap));

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("August 2026");
    expect(html).toContain("@media print");
    // No external assets: the report must render offline and print identically.
    expect(html).not.toMatch(/<(script|link)\b[^>]*\bsrc=|<link\b[^>]*\bhref=/i);
  });

  it("escapes text that came from user input", () => {
    const snap = snapshotWith([entry({ amount: 10, categoryId: "cat-xss" })]);
    snap.categories.push({
      id: "cat-xss",
      name: '<img src=x onerror="alert(1)">',
      bucket: "general",
      color: "#000000",
    });
    const html = reportHtml(buildPeriodReport(snap, "month", NOW), money(snap));

    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img src=x");
  });

  it("marks unknown months rather than drawing them as empty bars", () => {
    const snap = snapshotWith([entry({ month: 8, amount: 100 })]);
    const html = reportHtml(buildPeriodReport(snap, "month", NOW), money(snap));
    expect(html).toContain("bar-missing");
  });
});
