/**
 * Tests for the chart layer: the pure scale maths behind every axis, and the
 * analytics selectors that feed the chart-led Analytics page.
 *
 * The financial rules under test are the non-negotiable ones: 0 is a real
 * value, missing periods stay missing, and piloting spend never enters a
 * share percentage.
 */

import { describe, expect, it } from "vitest";
import {
  areaPath,
  compactNumber,
  cumulative,
  finiteValues,
  linePath,
  linearScale,
  niceDomain,
  niceStep,
  niceTicks,
  truncateToWidth,
} from "../src/components/charts/scale";
import {
  budgetPacing,
  categoryBreakdown,
  categoryMonthlySeries,
  cumulativeForecast,
  dailySpendingCalendar,
  financialHealth,
  periodComparison,
  recentPeriodTotals,
  recurringMonthlySplit,
  spendingStats,
} from "../src/domain/analytics";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { catId } from "./helpers/seedIds";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";
import { monthNames } from "../src/domain/i18n";

/**
 * The twelve short month names, as `Intl` writes them in English.
 *
 * These used to be a constant inside `domain/analytics.ts`, which put "Jan,
 * Feb, Mar" under every bar of the trend chart in every language. The chart
 * passes `monthNames("short")` from the translation hook now, and the tests
 * pass the same thing for English.
 */
const SHORT_MONTHS = monthNames("en", "short");

/** The English week marker under a bar; French writes S28, German KW28. */
const WEEK_AXIS = (week: number) => `W${week}`;

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
  // createSeedBudgetSnapshot hands back the shared `defaultCategories` array,
  // so clone it before any test pushes a fixture category into it.
  snap.categories = snap.categories.map((category) => ({ ...category }));
  snap.settings.selectedPeriodMode = "month";
  snap.settings.selectedYear = 2026;
  snap.settings.selectedMonth = 7;
  snap.settings.selectedWeek = 28;
  snap.settings.selectedWeekYear = 2026;
  snap.settings.baseCurrency = "EUR";
  snap.settings.monthlyBudget = 1000;
  snap.settings.monthlyBudgetCurrency = "EUR";
  return snap;
}

/** Every nice step must be 1, 2 or 5 times a power of ten. */
function isNiceStep(step: number): boolean {
  const exponent = Math.floor(Math.log10(step));
  const mantissa = step / Math.pow(10, exponent);
  return [1, 2, 5, 10].some((candidate) => Math.abs(mantissa - candidate) < 1e-9);
}

// ─── niceTicks / niceStep ────────────────────────────────────────────────────

describe("niceStep", () => {
  it("rounds up to the next 1/2/5 × 10ⁿ", () => {
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.5)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(4000)).toBe(5000);
    expect(niceStep(0.03)).toBeCloseTo(0.05, 10);
  });

  it("returns 0 for non-positive or non-finite input rather than guessing", () => {
    expect(niceStep(0)).toBe(0);
    expect(niceStep(-5)).toBe(0);
    expect(niceStep(Number.NaN)).toBe(0);
  });
});

describe("niceTicks", () => {
  it("keeps a large range readable instead of drawing hundreds of lines", () => {
    const ticks = niceTicks(0, 20000, 5);
    expect(ticks).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(ticks.length).toBeLessThan(10);
  });

  it("never hard-codes an interval — the step follows the magnitude", () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0, 1_000_000, 5)).toEqual([0, 200000, 400000, 600000, 800000, 1000000]);
  });

  it("rounds the step up rather than inventing a non-nice interval", () => {
    // 1,000,000 / 4 = 250,000, which is not 1/2/5 × 10ⁿ — it rounds up to
    // 500,000 and yields fewer ticks than asked for, never a 2.5 step.
    expect(niceTicks(0, 1_000_000, 4)).toEqual([0, 500000, 1000000]);
  });

  it("covers the whole range, first tick at or below min, last at or above max", () => {
    const ticks = niceTicks(37, 941, 5);
    expect(ticks[0]).toBeLessThanOrEqual(37);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(941);
  });

  it("returns ascending ticks with a uniform nice step for random ranges", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const max = seed * seed * 1.7 + seed / 3;
      const ticks = niceTicks(0, max, 5);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      // A nice step within ±2 of the target keeps gridlines from crowding.
      expect(ticks.length).toBeLessThanOrEqual(8);
      const step = ticks[1] - ticks[0];
      expect(isNiceStep(step)).toBe(true);
      for (let i = 1; i < ticks.length; i += 1) {
        expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
        expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step, 6);
      }
    }
  });

  it("handles fractional ranges without float drift", () => {
    expect(niceTicks(0, 1, 5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 0.5, 5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("spans negatives through zero", () => {
    expect(niceTicks(-50, 50, 4)).toEqual([-50, 0, 50]);
    expect(niceTicks(-30, 90, 4)).toContain(0);
  });

  it("swaps reversed bounds instead of returning nothing", () => {
    expect(niceTicks(100, 0, 5)).toEqual(niceTicks(0, 100, 5));
  });

  it("treats a flat range explicitly: zero stays [0], a value spans from zero", () => {
    expect(niceTicks(0, 0)).toEqual([0]);
    expect(niceTicks(250, 250, 5)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(niceTicks(-4, -4, 4)).toEqual([-4, -3, -2, -1, 0]);
  });

  it("returns nothing when a bound is not finite — an axis cannot be invented", () => {
    expect(niceTicks(Number.NaN, 10)).toEqual([]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("clamps silly tick targets", () => {
    expect(niceTicks(0, 100, 0).length).toBeGreaterThan(0);
    expect(niceTicks(0, 100, -3).length).toBeGreaterThan(0);
  });
});

describe("niceDomain", () => {
  it("uses the tick extremes as the axis domain", () => {
    const domain = niceDomain(0, 1830, 4);
    expect(domain.min).toBe(0);
    expect(domain.max).toBe(domain.ticks[domain.ticks.length - 1]);
    expect(domain.max).toBeGreaterThanOrEqual(1830);
  });

  it("stays usable when there is nothing to plot", () => {
    expect(niceDomain(Number.NaN, Number.NaN)).toEqual({ min: 0, max: 1, ticks: [] });
    expect(niceDomain(0, 0).max).toBeGreaterThan(niceDomain(0, 0).min);
  });
});

// ─── Other scale helpers ─────────────────────────────────────────────────────

describe("scale helpers", () => {
  it("maps a domain onto a pixel range, including inverted ranges", () => {
    const yOf = linearScale(0, 100, 200, 0);
    expect(yOf(0)).toBe(200);
    expect(yOf(100)).toBe(0);
    expect(yOf(50)).toBe(100);
  });

  it("collapses to a constant when the domain has no span", () => {
    const scale = linearScale(5, 5, 0, 100);
    expect(scale(5)).toBe(0);
  });

  it("compacts numbers for axis labels", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(1200)).toBe("1.2k");
    expect(compactNumber(20000)).toBe("20k");
    expect(compactNumber(2_400_000)).toBe("2.4M");
    expect(compactNumber(-1500)).toBe("-1.5k");
  });

  it("breaks lines at missing points instead of dropping them to zero", () => {
    const path = linePath([
      { x: 0, y: 10 },
      null,
      { x: 20, y: 30 },
    ]);
    expect(path).toBe("M0 10 M20 30");
    expect(path).not.toContain("L");
  });

  it("draws one closed area per contiguous run", () => {
    const path = areaPath(
      [
        { x: 0, y: 10 },
        { x: 10, y: 20 },
        null,
        { x: 30, y: 5 },
        { x: 40, y: 15 },
      ],
      100,
    );
    expect(path.match(/Z/g)).toHaveLength(2);
  });

  it("keeps 0 while dropping nulls when deriving a domain", () => {
    expect(finiteValues([0, null, 5, undefined, Number.NaN])).toEqual([0, 5]);
  });

  it("accumulates known values and leaves unknown ones unknown", () => {
    expect(cumulative([10, 0, null, 5])).toEqual([10, 10, null, 15]);
  });

  it("truncates labels rather than clipping them", () => {
    expect(truncateToWidth("Groceries", 500, 12)).toBe("Groceries");
    expect(truncateToWidth("Groceries and household", 40, 12).endsWith("…")).toBe(true);
    expect(truncateToWidth("Anything", 0, 12)).toBe("");
  });
});

// ─── dailySpendingCalendar ───────────────────────────────────────────────────

describe("dailySpendingCalendar", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("returns one cell per day of the selected month", () => {
    const snap = snapshotWith([entry({ amount: 40, date: "2026-07-03" })]);
    const cells = dailySpendingCalendar(snap.years["2026"].spendingEntries, snap, snap.settings, now)!;
    expect(cells).toHaveLength(31);
    expect(cells[0].date).toBe("2026-07-01");
    expect(cells[30].date).toBe("2026-07-31");
    // 2026-07-01 is a Wednesday → ISO weekday 3
    expect(cells[0].weekday).toBe(3);
  });

  it("keeps elapsed days without entries at a real zero and future days unknown", () => {
    const snap = snapshotWith([entry({ amount: 40, date: "2026-07-03" })]);
    const cells = dailySpendingCalendar(snap.years["2026"].spendingEntries, snap, snap.settings, now)!;
    expect(cells[2].value).toBe(40); // July 3 — recorded
    expect(cells[3].value).toBe(0); // July 4 — elapsed, nothing spent
    expect(cells[20].value).toBeNull(); // July 21 — has not happened yet
  });

  it("leaves a period with no records unknown end to end (missing ≠ zero)", () => {
    const snap = snapshotWith([]);
    const cells = dailySpendingCalendar([], snap, snap.settings, now)!;
    expect(cells.every((cell) => cell.value === null)).toBe(true);
  });

  it("sums several entries on the same day in base currency", () => {
    const snap = snapshotWith([
      entry({ amount: 40, date: "2026-07-03" }),
      entry({ amount: 60, date: "2026-07-03" }),
    ]);
    const cells = dailySpendingCalendar(snap.years["2026"].spendingEntries, snap, snap.settings, now)!;
    expect(cells[2].value).toBe(100);
  });

  it("covers exactly the seven days of the selected ISO week", () => {
    const snap = snapshotWith([entry({ amount: 25, date: "2026-07-08", week: 28 })]);
    snap.settings.selectedPeriodMode = "week";
    const cells = dailySpendingCalendar(snap.years["2026"].spendingEntries, snap, snap.settings, now)!;
    expect(cells).toHaveLength(7);
    expect(cells[0].date).toBe("2026-07-06"); // Monday of ISO week 28
    expect(cells[0].weekday).toBe(1);
    expect(cells[6].weekday).toBe(7);
    expect(cells[2].value).toBe(25);
  });

  it("has no daily grid in year mode", () => {
    const snap = snapshotWith([entry({ amount: 10 })]);
    snap.settings.selectedPeriodMode = "year";
    expect(dailySpendingCalendar(snap.years["2026"].spendingEntries, snap, snap.settings, now)).toBeNull();
  });
});

// ─── categoryMonthlySeries ───────────────────────────────────────────────────

describe("categoryMonthlySeries", () => {
  it("keeps months without records null and months with records at a real zero", () => {
    const snap = snapshotWith([
      entry({ amount: 100, month: 3, date: "2026-03-04", categoryId: "cat-food" }),
      entry({ amount: 50, month: 4, date: "2026-04-04", categoryId: "cat-health" }),
    ]);
    snap.categories.push({ id: "cat-food", name: "Food", bucket: "general", color: "#00ff00" });

    const { labels, series } = categoryMonthlySeries(snap, snap.settings, SHORT_MONTHS, 4);
    expect(labels).toHaveLength(12);
    const food = series.find((item) => item.categoryId === "cat-food")!;
    expect(food.values[2]).toBe(100); // March — recorded
    expect(food.values[3]).toBe(0); // April has records, Food simply spent nothing
    expect(food.values[0]).toBeNull(); // January has no records at all
  });

  it("ranks by year total and honours the top-N limit", () => {
    const snap = snapshotWith([
      entry({ amount: 500, categoryId: "cat-health" }),
      entry({ amount: 300, categoryId: "cat-learning" }),
      entry({ amount: 100, categoryId: "cat-other" }),
    ]);
    const { series } = categoryMonthlySeries(snap, snap.settings, SHORT_MONTHS, 2);
    expect(series).toHaveLength(2);
    expect(series[0].categoryId).toBe("cat-health");
    expect(series[1].categoryId).toBe("cat-learning");
    expect(series[0].total).toBe(500);
  });

  it("returns an empty series list when the year has no records", () => {
    const snap = snapshotWith([]);
    expect(categoryMonthlySeries(snap, snap.settings, SHORT_MONTHS).series).toEqual([]);
  });
});

// ─── recurringMonthlySplit ───────────────────────────────────────────────────

describe("recurringMonthlySplit", () => {
  it("splits committed from discretionary spend per month", () => {
    const snap = snapshotWith([
      entry({ amount: 200, month: 5, date: "2026-05-02", recurrenceType: "monthly" }),
      entry({ amount: 50, month: 5, date: "2026-05-09", recurrenceType: "none" }),
      entry({ amount: 30, month: 6, date: "2026-06-09", recurrenceType: "purchase" }),
    ]);
    const split = recurringMonthlySplit(snap, snap.settings, SHORT_MONTHS);
    expect(split.recurring[4]).toBe(200);
    expect(split.oneOff[4]).toBe(50);
    expect(split.recurring[5]).toBe(0); // June has records but nothing recurring
    expect(split.oneOff[5]).toBe(30);
    expect(split.recurring[0]).toBeNull(); // January has no records
    expect(split.oneOff[0]).toBeNull();
  });
});

// ─── recentPeriodTotals ──────────────────────────────────────────────────────

describe("recentPeriodTotals", () => {
  it("ends on the selected period and marks it as the highlight", () => {
    const snap = snapshotWith([
      entry({ amount: 100, month: 7, date: "2026-07-09" }),
      entry({ amount: 60, month: 6, date: "2026-06-09", week: 24 }),
    ]);
    const bars = recentPeriodTotals(snap, snap.settings, SHORT_MONTHS, WEEK_AXIS, 4);
    expect(bars).toHaveLength(4);
    expect(bars[3].label).toBe("Jul");
    expect(bars[3].highlight).toBe(true);
    expect(bars.filter((bar) => bar.highlight)).toHaveLength(1);
    expect(bars[3].value).toBe(100);
    expect(bars[2].value).toBe(60);
  });

  it("leaves periods without records null rather than zero", () => {
    const snap = snapshotWith([entry({ amount: 100, month: 7 })]);
    const bars = recentPeriodTotals(snap, snap.settings, SHORT_MONTHS, WEEK_AXIS, 3);
    expect(bars[0].value).toBeNull();
    expect(bars[1].value).toBeNull();
    expect(bars[2].value).toBe(100);
  });

  it("labels weeks and years compactly", () => {
    const snap = snapshotWith([]);
    snap.settings.selectedPeriodMode = "week";
    expect(recentPeriodTotals(snap, snap.settings, SHORT_MONTHS, WEEK_AXIS, 2).map((bar) => bar.label)).toEqual(["W27", "W28"]);

    snap.settings.selectedPeriodMode = "year";
    expect(recentPeriodTotals(snap, snap.settings, SHORT_MONTHS, WEEK_AXIS, 2).map((bar) => bar.label)).toEqual(["2025", "2026"]);
  });

  it("always returns at least one period", () => {
    const snap = snapshotWith([]);
    expect(recentPeriodTotals(snap, snap.settings, SHORT_MONTHS, WEEK_AXIS, 0)).toHaveLength(1);
  });
});

describe("the axis label under each bar", () => {
  it("shortens each mode to something that fits, in the reader's language", () => {
    /*
     * `compactPeriodLabel` was exported and used by nothing but this test. It
     * is a private helper of `recentPeriodTotals` now, so what it produces is
     * checked where it is actually seen — under the bars.
     */
    const snap = snapshotWith([]);
    const bars = recentPeriodTotals(snap, snap.settings, SHORT_MONTHS, WEEK_AXIS, 3);
    expect(bars.map((bar) => bar.label)).toEqual(["May", "Jun", "Jul"]);

    const weekly = recentPeriodTotals(
      { ...snap, settings: { ...snap.settings, selectedPeriodMode: "week" } },
      { ...snap.settings, selectedPeriodMode: "week" },
      SHORT_MONTHS,
      WEEK_AXIS,
      1,
    );
    expect(weekly[0].label).toBe("W28");

    const yearly = recentPeriodTotals(
      { ...snap, settings: { ...snap.settings, selectedPeriodMode: "year" } },
      { ...snap.settings, selectedPeriodMode: "year" },
      SHORT_MONTHS,
      WEEK_AXIS,
      1,
    );
    expect(yearly[0].label).toBe("2026");

    // And the month name really does follow the language, which is the whole
    // reason the names are an argument now.
    const french = recentPeriodTotals(snap, snap.settings, monthNames("fr", "short"), WEEK_AXIS, 1);
    expect(french[0].label).not.toBe("Jul");
  });
});

// ─── cumulativeForecast ──────────────────────────────────────────────────────

describe("cumulativeForecast", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("accumulates known days and projects the rest at the current pace", () => {
    const snap = snapshotWith([
      entry({ amount: 100, date: "2026-07-01" }),
      entry({ amount: 200, date: "2026-07-10" }),
    ]);
    const forecast = cumulativeForecast(snap.years["2026"].spendingEntries, snap, snap.settings, now)!;

    expect(forecast.labels).toHaveLength(31);
    expect(forecast.actual[0]).toBe(100);
    expect(forecast.actual[8]).toBe(100); // nothing spent on the 9th — still 100
    expect(forecast.actual[9]).toBe(300);
    expect(forecast.actual[14]).toBe(300); // last elapsed day
    expect(forecast.actual[15]).toBeNull(); // the 16th has not happened

    // 300 over 15 elapsed days → 20/day → 620 across a 31-day month
    expect(forecast.projected[14]).toBeCloseTo(300);
    expect(forecast.projected[30]).toBeCloseTo(620);
    expect(forecast.projectedTotal).toBeCloseTo(620);
    expect(forecast.budget).toBe(1000);
  });

  it("stops projecting once the period is complete", () => {
    const snap = snapshotWith([entry({ amount: 310, date: "2026-07-05" })]);
    const forecast = cumulativeForecast(
      snap.years["2026"].spendingEntries,
      snap,
      snap.settings,
      new Date("2026-09-10T12:00:00Z"),
    )!;
    expect(forecast.actual[30]).toBe(310);
    expect(forecast.projected.every((value) => value === null)).toBe(true);
    expect(forecast.projectedTotal).toBeNull();
  });

  it("has no budget ceiling outside month mode", () => {
    const snap = snapshotWith([entry({ amount: 40, date: "2026-07-08", week: 28 })]);
    snap.settings.selectedPeriodMode = "week";
    const forecast = cumulativeForecast(snap.years["2026"].spendingEntries, snap, snap.settings, now)!;
    expect(forecast.labels).toHaveLength(7);
    expect(forecast.budget).toBeNull();
  });

  it("returns null when there is nothing to draw", () => {
    const empty = snapshotWith([]);
    expect(cumulativeForecast([], empty, empty.settings, now)).toBeNull();

    const yearly = snapshotWith([entry({ amount: 10 })]);
    yearly.settings.selectedPeriodMode = "year";
    expect(cumulativeForecast(yearly.years["2026"].spendingEntries, yearly, yearly.settings, now)).toBeNull();
  });
});

// ─── financialHealth ─────────────────────────────────────────────────────────

describe("financialHealth", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  function healthFor(snap: BudgetSnapshot) {
    const entries = snap.years["2026"].spendingEntries;
    return financialHealth({
      pacing: budgetPacing(snap, entries, now),
      categories: categoryBreakdown(entries, snap),
      comparison: periodComparison(snap, snap.settings),
      stats: spendingStats(entries, snap),
    });
  }

  it("reports no score at all when nothing is measurable", () => {
    const snap = snapshotWith([]);
    snap.settings.monthlyBudget = 0;
    const health = healthFor(snap);
    expect(health.score).toBeNull();
    expect(health.grade).toBeNull();
    expect(health.factors).toEqual([]);
  });

  it("does not score a period with no records as perfect adherence", () => {
    // budgetPacing reports spend 0 for an empty period; an unknown period must
    // not therefore read as a flawless one.
    const snap = snapshotWith([]);
    snap.settings.monthlyBudget = 1000;
    const health = healthFor(snap);
    expect(health.factors.some((factor) => factor.id === "budget")).toBe(false);
    expect(health.score).toBeNull();
  });

  it("still scores a period that genuinely recorded a zero", () => {
    const snap = snapshotWith([entry({ amount: 0, date: "2026-07-05" })]);
    const health = healthFor(snap);
    expect(health.factors.some((factor) => factor.id === "budget")).toBe(true);
    expect(health.score).toBe(100);
  });

  it("scores a comfortably paced month highly", () => {
    const snap = snapshotWith([entry({ amount: 200, date: "2026-07-05" })]);
    const health = healthFor(snap);
    // 200 over 15 days → ~413 projected against a 1,000 budget
    expect(health.score).not.toBeNull();
    expect(health.score!).toBeGreaterThanOrEqual(70);
    expect(health.factors.some((factor) => factor.id === "budget")).toBe(true);
  });

  it("drops the score when the pace overshoots the budget", () => {
    const calm = healthFor(snapshotWith([entry({ amount: 200, date: "2026-07-05" })]));
    const overspent = healthFor(snapshotWith([entry({ amount: 1500, date: "2026-07-05" })]));
    expect(overspent.score!).toBeLessThan(calm.score!);
    expect(overspent.factors.find((factor) => factor.id === "budget")!.score).toBe(0);
  });

  it("renormalises weights over the factors it can actually compute", () => {
    const snap = snapshotWith([entry({ amount: 200, date: "2026-07-05" })]);
    snap.settings.monthlyBudget = 0; // no budget → no adherence factor
    const health = healthFor(snap);
    expect(health.factors.some((factor) => factor.id === "budget")).toBe(false);
    expect(health.factors.length).toBeGreaterThan(0);
    expect(health.score).not.toBeNull();
    expect(health.score!).toBeGreaterThanOrEqual(0);
    expect(health.score!).toBeLessThanOrEqual(100);
  });

  it("penalises breached category caps", () => {
    const withinCap = snapshotWith([entry({ amount: 100, date: "2026-07-05", categoryId: "cat-capped" })]);
    withinCap.categories.push({
      id: "cat-capped",
      name: "Capped",
      bucket: "general",
      color: "#ff8800",
      monthlyCap: 400,
    });
    const breached = snapshotWith([entry({ amount: 100, date: "2026-07-05", categoryId: "cat-capped" })]);
    breached.categories.push({
      id: "cat-capped",
      name: "Capped",
      bucket: "general",
      color: "#ff8800",
      monthlyCap: 20,
    });

    const capFactor = (snap: BudgetSnapshot) => healthFor(snap).factors.find((factor) => factor.id === "caps")!;
    expect(capFactor(withinCap).score).toBe(100);
    expect(capFactor(breached).score).toBe(0);
    expect(healthFor(breached).score!).toBeLessThan(healthFor(withinCap).score!);
  });

  it("grades the score consistently", () => {
    const grades = new Set<string>();
    for (const amount of [50, 700, 900, 2000]) {
      const health = healthFor(snapshotWith([entry({ amount, date: "2026-07-05" })]));
      if (health.grade) grades.add(health.grade);
      if (health.score != null) {
        expect(health.score).toBeGreaterThanOrEqual(0);
        expect(health.score).toBeLessThanOrEqual(100);
      }
    }
    expect(grades.size).toBeGreaterThan(1);
  });
});

// ─── Financial rules that must survive the chart layer ───────────────────────

describe("chart data honours the financial rules", () => {
  it("gives every category a share of the same total, with no category exempt", () => {
    // Resolved against this snapshot: seed ids are generated per budget, so a
    // second snapshotWith() call would produce ids that do not exist here.
    const snap = snapshotWith([]);
    const pilotingId = catId(snap, "cat-piloting");
    const healthId = catId(snap, "cat-health");
    snap.years["2026"].spendingEntries = [
      entry({ amount: 400, categoryId: healthId }),
      entry({ amount: 600, categoryId: pilotingId }),
    ];
    const rows = categoryBreakdown(snap.years["2026"].spendingEntries, snap);
    const piloting = rows.find((row) => row.categoryId === pilotingId)!;
    const health = rows.find((row) => row.categoryId === healthId)!;

    // The "piloting" bucket used to be charted but given a null share, which
    // is why the shares needed a footnote explaining why they did not sum to
    // 100. It is a category like any other now.
    expect(piloting.total).toBe(600);
    expect(piloting.share).toBeCloseTo(60);
    expect(health.share).toBeCloseTo(40);
    expect((piloting.share ?? 0) + (health.share ?? 0)).toBeCloseTo(100);
  });

  it("never turns a recorded zero into missing data", () => {
    const snap = snapshotWith([entry({ amount: 0, date: "2026-07-02" })]);
    const cells = dailySpendingCalendar(
      snap.years["2026"].spendingEntries,
      snap,
      snap.settings,
      new Date("2026-07-15T12:00:00Z"),
    )!;
    expect(cells[1].value).toBe(0);
    expect(spendingStats(snap.years["2026"].spendingEntries, snap).total).toBe(0);
  });

  it("converts currency for display without changing stored amounts", () => {
    const snap = snapshotWith([entry({ amount: 100, currency: "USD", date: "2026-07-02" })]);
    snap.settings.baseCurrency = "EUR";
    snap.settings.exchangeRates.eurUsd = 2;
    const cells = dailySpendingCalendar(
      snap.years["2026"].spendingEntries,
      snap,
      snap.settings,
      new Date("2026-07-15T12:00:00Z"),
    )!;
    expect(cells[1].value).toBeCloseTo(50); // 100 USD at 2 USD per EUR
    expect(snap.years["2026"].spendingEntries[0].amount).toBe(100); // untouched
  });
});
