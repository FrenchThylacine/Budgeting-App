/**
 * Period reports. A printed report is a record the user may act on, so the
 * same rules apply as on screen: figures come from the shared selectors, and a
 * period with no data must never be printed as a confident zero.
 */

import { describe, expect, it } from "vitest";
import { buildPeriodReport, reportHtml } from "../src/domain/report";
import { createTranslator } from "../src/domain/i18n";
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
  it("is written in the reader's language when one is supplied", () => {
    const snap = snapshotWith([entry({ amount: 100 })]);
    const report = buildPeriodReport(snap, "month", NOW, createTranslator("fr"));

    // The dictionary chunk is not loaded in this process, so the strings fall
    // back to English — but the *locale* is live from the first call, which is
    // what decides the month name and the number format.
    expect(report.language).toBe("fr");
    expect(report.title).toBe("août 2026");
  });

  it("reports the selected month", () => {
    const snap = snapshotWith([entry({ amount: 120 }), entry({ amount: 80 })]);
    const report = buildPeriodReport(snap, "month", NOW);

    expect(report.title).toBe("August 2026");
    expect(report.subtitle).toBe("Monthly report");
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

    expect(report.summary.find((s) => s.label === "Total spending")!.value).toBe("Nothing recorded");
    expect(report.notes.some((n) => n.includes("not as zero"))).toBe(true);
  });

  it("keeps a real zero distinct from missing", () => {
    const snap = snapshotWith([entry({ amount: 0 })]);
    const report = buildPeriodReport(snap, "month", NOW);
    expect(report.summary.find((s) => s.label === "Total spending")!.value).not.toBe("Nothing recorded");
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
    expect(report.notes.some((n) => /over (its|their) cap/i.test(n))).toBe(true);
  });

  it("has no note about piloting, because there is nothing special about it", () => {
    // Resolved against this snapshot: seed ids are generated per budget, so a
    // second snapshotWith() call would produce ids that do not exist here.
    const snap = snapshotWith([]);
    snap.years["2026"].spendingEntries = [entry({ amount: 100, categoryId: catId(snap, "cat-piloting") })];
    const report = buildPeriodReport(snap, "month", NOW);

    // The note existed to explain why one category was charted but had no
    // share. Every category takes a share now, so there is nothing to explain.
    expect(report.notes.some((n) => /piloting/i.test(n))).toBe(false);
    const line = report.categories.find((c) => /piloting/i.test(c.category?.name ?? ""))!;
    expect(line.share).toBeCloseTo(100);
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

describe("reports for a custom range", () => {
  const NOW = new Date("2026-08-21T12:00:00Z");

  function snapshotWithDates(dates: { date: string; amount: number; source?: string }[]): BudgetSnapshot {
    const snap = createSeedBudgetSnapshot(NOW);
    snap.settings.selectedYear = 2026;
    snap.settings.selectedMonth = 8;
    snap.settings.baseCurrency = "EUR";
    snap.settings.monthlyBudget = 1000;
    snap.settings.monthlyBudgetCurrency = "EUR";
    snap.years["2026"] = {
      year: 2026,
      activities: [],
      spendingEntries: dates.map((item, index) => ({
        id: `entry-${index}`,
        year: Number(item.date.slice(0, 4)),
        month: Number(item.date.slice(5, 7)),
        week: 1,
        date: item.date,
        categoryId: snap.categories[0].id,
        amount: item.amount,
        currency: "EUR" as const,
        recurrenceType: "none" as const,
        isPiloting: false,
        source: item.source,
        note: "",
        createdAt: `${item.date}T00:00:00Z`,
        updatedAt: `${item.date}T00:00:00Z`,
      })),
      wishlistItems: [],
      walletEntries: [],
      closedMonths: [],
      monthlyNotes: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
    return snap;
  }

  it("counts only the transactions inside the range, at both ends inclusively", () => {
    const snap = snapshotWithDates([
      { date: "2026-03-31", amount: 10 }, // the day before
      { date: "2026-04-01", amount: 20 }, // first day
      { date: "2026-04-15", amount: 30 },
      { date: "2026-04-30", amount: 40 }, // last day
      { date: "2026-05-01", amount: 50 }, // the day after
    ]);
    const report = buildPeriodReport(snap, { from: "2026-04-01", to: "2026-04-30" }, NOW);
    const line = (label: string) => report.summary.find((item) => item.label === label)?.value;
    expect(line("Transactions")).toBe("3");
    expect(line("Total spending")).toContain("90");
  });

  it("states no budget figure rather than prorating one", () => {
    // The budget is monthly. A "budget" for six weeks is a number the user
    // never chose, and "remaining" measured against it would be fabricated.
    const snap = snapshotWithDates([{ date: "2026-04-10", amount: 100 }]);
    const report = buildPeriodReport(snap, { from: "2026-04-01", to: "2026-05-15" }, NOW);
    expect(report.summary.find((item) => item.label === "Budget")).toBeUndefined();
    expect(report.summary.find((item) => item.label === "Remaining")).toBeUndefined();
    expect(report.notes.join(" ")).toMatch(/the budget is monthly/i);
  });

  it("compares against the range of equal length immediately before", () => {
    const snap = snapshotWithDates([
      { date: "2026-04-05", amount: 200 },
      { date: "2026-03-20", amount: 150 },
    ]);
    const report = buildPeriodReport(snap, { from: "2026-04-01", to: "2026-04-30" }, NOW);
    const comparison = report.summary.find((item) => item.label.startsWith("vs "))!;
    // March is the preceding 30 days: 200 − 150 = 50.
    expect(comparison.value).toContain("50");
  });

  it("still excludes money somebody else paid", () => {
    const snap = snapshotWithDates([
      { date: "2026-04-05", amount: 300, source: "personal" },
      { date: "2026-04-06", amount: 200, source: "shared" },
    ]);
    const report = buildPeriodReport(snap, { from: "2026-04-01", to: "2026-04-30" }, NOW);
    const line = (label: string) => report.summary.find((item) => item.label === label)?.value;
    expect(line("Total spending")).toContain("300");
    // Recorded in full, in the funding table, and charged to nothing.
    const other = report.funding.lines.find((entry) => entry.kind === "other")!;
    expect(other.amount).toBeCloseTo(200, 6);
  });

  it("reports an empty range as unavailable rather than as zero", () => {
    const snap = snapshotWithDates([{ date: "2026-04-05", amount: 100 }]);
    const report = buildPeriodReport(snap, { from: "2026-06-01", to: "2026-06-30" }, NOW);
    expect(report.summary.find((item) => item.label === "Total spending")?.value).toBe("Nothing recorded");
    expect(report.notes.join(" ")).toMatch(/Missing data is reported as unavailable, not as zero/i);
  });

  it("titles the report with the range it covers", () => {
    const snap = snapshotWithDates([]);
    const report = buildPeriodReport(snap, { from: "2026-04-01", to: "2026-04-30" }, NOW);
    // Formatted against the *report's* locale, not the machine's. That is the
    // whole point of threading a translator through: this assertion used to
    // have to be a loose regex because the answer depended on where the test
    // was run.
    expect(report.title).toBe("Apr 1 – Apr 30, 2026");
    expect(report.subtitle).toBe("30-day report");
  });

  it("renders to self-contained HTML like any other report", () => {
    const snap = snapshotWithDates([{ date: "2026-04-05", amount: 100 }]);
    const report = buildPeriodReport(snap, { from: "2026-04-01", to: "2026-04-30" }, NOW);
    const html = reportHtml(report, (value) => `EUR ${value.toFixed(2)}`);
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain("http://");
    expect(html).toContain("Print / save as PDF");
  });
});
