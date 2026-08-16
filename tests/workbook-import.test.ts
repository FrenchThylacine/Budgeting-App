/**
 * Excel import.
 *
 * The fixtures reproduce the *real* workbook's layout rather than a tidied
 * version of it, because the layout is what the previous importer got wrong:
 * blank separator rows, headers on row 3 rather than row 0, amounts stored as
 * "$41.67" and "€30.00", "NaN" for unknown, five years side by side, and 55
 * week rows in a 52-week year.
 *
 * The user's actual file is not committed — it holds their finances — so the
 * shape is rebuilt here from what was measured in it.
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { WorkbookShapeError, parseAmount, parseWorkbook } from "../src/domain/workbookImport";

const NOW = new Date("2026-08-16T12:00:00Z");

/** Deterministic ids, so assertions can name rows. */
function sequentialIds(): (prefix: string) => string {
  const counters = new Map<string, number>();
  return (prefix) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };
}

function sheetFrom(rows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(rows);
}

/**
 * The Budget sheet: metadata on row 0, two blank rows, then a header row whose
 * left half is activities and right half is the wishlist.
 */
function budgetRows(): unknown[][] {
  return [
    ["Budget Iyad", null, null, "Updated:", new Date("2026-07-03"), null, "EUR/USD rate:", 1.19, "Personal Balance", "€339.39"],
    [],
    [],
    ["Activities", "Currency", "Per Session", "Per Month", "=> Eq EUR", "Per Year ", "=> Eq EUR", null, "What I want", "Price", "Bought", "Whislist", "Effective Price"],
    ["Gym", "USD", "38.50", 385, 323.529, "4,620.00", 3882.353, null, "Zephyrus G14", 2700, true, false, "€0.00"],
    ["Arabic", "USD", 35, "140.00", 117.647, 1680, 1411.765, null, "Steam Frame", 900, false, true, "€0.00"],
    ["Aviation (~aprox)", "EUR", "N/A", "1,250.00", "1,250.00", 15000, "15000.00", null, "WinCTRL UrsaMinor", 60, false, false, "€60.00"],
    ["PC Maintenance", "USD", 35, "N/A", "N/A", 35, 29.412, null, "PSESIM CDG", "N/A", false, false, "N/A"],
    ["Nebula", "EUR", "N/A", "N/A", "N/A", 43.2, "43.20", null, "Rafale Model", 57.8, false, false, "€57.80"],
    ["Total", "EUR", "€21,035.19", null, 1721.429, null, 20811.395, null, "Inibuild L1011", 55, true, false, "€0.00"],
    ["Balance:", "EUR ", 843.588, "No Piloting", "504.20", "No Piloting", "6,050.420"],
  ];
}

/**
 * The Spending sheet: five years in groups of three columns, the year label
 * over the middle column of each group, 55 week rows, then a separate monthly
 * block repeating the same figures.
 */
function spendingRows(): unknown[][] {
  const rows: unknown[][] = [
    ["Spending Iyad", null, "EUR/USD rate:", 1.19, "USD/L.L. rate:", 90000, "Current Week #", 33],
    [],
    ["Year", null, 2026, null, null, 2027, null, null, 2028, null, null, 2029, null, null, 2030],
    ["Week #", "L.L. + USD", "EUR", "Total", "L.L. (in $)", "€", "Total", "L.L. (in $)", "€", "Total", "L.L. (in $)", "€", "Total", "L.L. (in $)", "€", "Total"],
  ];

  // Weeks 1–9: unknown. Week 10 onwards: real figures, including genuine
  // zeros. Weeks 40+ empty. Weeks 53–55 exist as layout only.
  for (let week = 1; week <= 55; week += 1) {
    if (week <= 9) rows.push([`Week ${week}`, "NaN", "NaN", "NaN"]);
    else if (week === 10) rows.push([`Week ${week}`, "$41.67", "€30.00", "€65.01"]);
    else if (week === 11) rows.push([`Week ${week}`, 35, 0, "€29.41"]);
    else if (week === 12) rows.push([`Week ${week}`, 0, 0, "€0.00"]);
    else if (week === 13) rows.push([`Week ${week}`, "$1,200.50", "€5.00", "€1,013.03"]);
    else rows.push([`Week ${week}`, null, null, "€0.00"]);
  }

  rows.push(["Total", "$2,663.78", "$161.00", "$2,399.47"]);
  rows.push([]);
  // The monthly block. Its figures are the weekly ones re-totalled; importing
  // both would double every amount.
  rows.push(["Year", null, 2026]);
  rows.push(["Per Month", "L.L. + USD", "EUR", "Total", "Total Δ: "]);
  rows.push(["January ", "NaN", "NaN", "NaN", "NaN"]);
  rows.push(["Febuary", "$41.67", 30, "€65.01", "NaN"]);
  rows.push(["Total", null, null, null, ""]);
  return rows;
}

function workbook(overrides: { budget?: unknown[][]; spending?: unknown[][] } = {}): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFrom(overrides.budget ?? budgetRows()), "Budget");
  XLSX.utils.book_append_sheet(wb, sheetFrom(overrides.spending ?? spendingRows()), "Spending");
  return wb;
}

function importFixture(overrides?: { budget?: unknown[][]; spending?: unknown[][] }) {
  return parseWorkbook(workbook(overrides), NOW, "fixture.xlsx", sequentialIds());
}

// ─── Reading amounts ─────────────────────────────────────────────────────────

describe("parseAmount", () => {
  it("keeps zero, because zero is a real amount", () => {
    // The single most important case: a week with no spending is data, and
    // collapsing it into "unknown" loses a fact the user recorded.
    expect(parseAmount(0)).toBe(0);
    expect(parseAmount("0")).toBe(0);
    expect(parseAmount("€0.00")).toBe(0);
  });

  it("returns null for everything that means 'not known'", () => {
    // And never 0, which would invent a figure the file does not state.
    for (const value of [null, undefined, "", "  ", "N/A", "n/a", "NaN", "—", "-", NaN, Infinity]) {
      expect(parseAmount(value), `${String(value)} must be null`).toBeNull();
    }
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseAmount("$41.67")).toBeCloseTo(41.67);
    expect(parseAmount("€30.00")).toBe(30);
    expect(parseAmount("4,620.00")).toBe(4620);
    expect(parseAmount("$2,663.78")).toBeCloseTo(2663.78);
    expect(parseAmount("€21,035.19")).toBeCloseTo(21035.19);
  });

  it("reads comma-decimal formats", () => {
    expect(parseAmount("1.234,56")).toBeCloseTo(1234.56);
    expect(parseAmount("1 250,00")).toBe(1250);
    expect(parseAmount("57,8")).toBeCloseTo(57.8);
  });

  it("reads parenthesised negatives", () => {
    expect(parseAmount("(120.00)")).toBe(-120);
  });
});

// ─── The whole workbook ──────────────────────────────────────────────────────

describe("importing the workbook", () => {
  it("finds every activity, including the ones above the old fixed offset", () => {
    const { snapshot, summary } = importFixture();
    const year = snapshot.years[String(snapshot.settings.selectedYear)];
    // The previous importer started at a hardcoded row and read the sheet with
    // blankrows: false, so it began below Gym and Arabic and silently lost them.
    expect(year.activities.map((a) => a.name)).toEqual([
      "Gym", "Arabic", "Aviation (~aprox)", "PC Maintenance", "Nebula",
    ]);
    expect(summary.activities).toBe(5);
  });

  it("stops the activity block at its Total row", () => {
    const { snapshot } = importFixture();
    const year = snapshot.years[String(snapshot.settings.selectedYear)];
    expect(year.activities.some((a) => a.name === "Total")).toBe(false);
    expect(year.activities.some((a) => a.name.startsWith("Balance"))).toBe(false);
  });

  it("reads prices from the columns their headers name", () => {
    const { snapshot } = importFixture();
    const year = snapshot.years[String(snapshot.settings.selectedYear)];
    const gym = year.activities.find((a) => a.name === "Gym")!;
    expect(gym.currency).toBe("USD");
    expect(gym.pricePerSession).toBeCloseTo(38.5);
    expect(gym.pricePerMonth).toBe(385);
    expect(gym.yearlyEstimate).toBe(4620);

    // "N/A" must stay missing rather than become 0, or a yearly subscription
    // acquires a monthly price it does not have.
    const nebula = year.activities.find((a) => a.name === "Nebula")!;
    expect(nebula.pricePerMonth).toBeNull();
    expect(nebula.pricePerSession).toBeNull();
    expect(nebula.yearlyEstimate).toBeCloseTo(43.2);
  });

  it("finds every wishlist item, including the two most expensive", () => {
    const { snapshot } = importFixture();
    const year = snapshot.years[String(snapshot.settings.selectedYear)];
    expect(year.wishlistItems.map((w) => w.name)).toEqual([
      "Zephyrus G14", "Steam Frame", "WinCTRL UrsaMinor", "PSESIM CDG", "Rafale Model", "Inibuild L1011",
    ]);
    const zephyrus = year.wishlistItems.find((w) => w.name === "Zephyrus G14")!;
    expect(zephyrus.actualPrice).toBe(2700);
    expect(zephyrus.bought).toBe(true);
    // An item with no price keeps that fact rather than being priced at 0.
    expect(year.wishlistItems.find((w) => w.name === "PSESIM CDG")!.actualPrice).toBeNull();
  });

  it("counts only unbought, still-wanted items toward the wishlist total", () => {
    const { snapshot } = importFixture();
    const year = snapshot.years[String(snapshot.settings.selectedYear)];
    const bought = year.wishlistItems.find((w) => w.name === "Zephyrus G14")!;
    const wanted = year.wishlistItems.find((w) => w.name === "Steam Frame")!;
    expect(bought.effectiveValue).toBe(0);
    expect(wanted.effectiveValue).toBe(900);
  });

  it("imports every year the sheet lays out, not just the first", () => {
    const { summary } = importFixture();
    // The previous importer kept one year, and the server's targeted-delete
    // pass then removed the rest — so an import silently destroyed them.
    expect(summary.years).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("reads each year from the columns its own header sits over", () => {
    const spending = spendingRows();
    // Give 2027 a figure, in its own group.
    spending[4 + 10] = ["Week 11", 35, 0, "€29.41", "$99.00", "€11.00", "€94.19"];
    const { snapshot } = importFixture({ spending });
    const entries2027 = snapshot.years["2027"].spendingEntries;
    expect(entries2027.map((e) => [e.currency, e.amount])).toEqual([
      ["USD", 99],
      ["EUR", 11],
    ]);
  });

  it("keeps recorded zeros and drops unknowns", () => {
    const { snapshot } = importFixture();
    const entries = snapshot.years["2026"].spendingEntries;
    const weeks = [...new Set(entries.map((e) => e.week))].sort((a, b) => a - b);

    // Weeks 1–9 say "NaN": unknown, so nothing is recorded.
    expect(weeks).toEqual([10, 11, 12, 13]);
    // Week 12 is a recorded zero-spend week and must survive.
    const week12 = entries.filter((e) => e.week === 12);
    expect(week12).toHaveLength(2);
    expect(week12.every((e) => e.amount === 0)).toBe(true);
  });

  it("skips the week rows that fall outside the calendar year", () => {
    const { snapshot, warnings } = importFixture();
    const weeks = snapshot.years["2026"].spendingEntries.map((e) => e.week);
    expect(Math.max(...weeks)).toBeLessThanOrEqual(53);
    expect(warnings.some((w) => w.includes("outside the calendar year"))).toBe(true);
  });

  it("does not import the monthly block as well as the weekly one", () => {
    const { snapshot } = importFixture();
    const entries = snapshot.years["2026"].spendingEntries;
    // The monthly block restates the same figures. Reading both would double
    // every amount in the year.
    const usd = entries.filter((e) => e.currency === "USD").reduce((n, e) => n + e.amount, 0);
    expect(usd).toBeCloseTo(41.67 + 35 + 0 + 1200.5);
  });

  it("reads the balance even though the cell is written '€339.39'", () => {
    const { snapshot } = importFixture();
    const wallet = snapshot.years[String(snapshot.settings.selectedYear)].walletEntries;
    // The previous parser produced 0 here, which is not "missing" — it is a
    // different, wrong number.
    expect(wallet).toHaveLength(1);
    expect(wallet[0].amount).toBeCloseTo(339.39);
    expect(wallet[0].type).toBe("opening");
  });

  it("reads the rates and the monthly budget from their labels", () => {
    const { snapshot } = importFixture();
    expect(snapshot.settings.exchangeRates.eurUsd).toBeCloseTo(1.19);
    expect(snapshot.settings.exchangeRates.usdLbp).toBe(90000);
    expect(snapshot.settings.monthlyBudget).toBeCloseTo(504.2);
  });

  it("survives the metadata moving to different columns", () => {
    const budget = budgetRows();
    // Same labels, shifted: the values are found by label, not by position.
    budget[0] = [null, "EUR/USD rate:", 1.25, null, "Personal Balance", "€1,000.00"];
    const { snapshot } = importFixture({ budget });
    expect(snapshot.settings.exchangeRates.eurUsd).toBeCloseTo(1.25);
    expect(
      snapshot.years[String(snapshot.settings.selectedYear)].walletEntries[0].amount,
    ).toBe(1000);
  });

  it("creates no budget approvals", () => {
    const { snapshot } = importFixture();
    // Approvals are permanent records of decisions made in this app. A
    // spreadsheet contains none, and inventing them would be fabrication.
    expect(snapshot.budgetApprovals).toEqual([]);
  });
});

// ─── Failing loudly ──────────────────────────────────────────────────────────

describe("rejecting a file that is not this workbook", () => {
  it("names the sheets it found when the expected one is missing", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom([["hello"]]), "Sheet1");
    // The previous importer fell back to the first sheet and produced confident
    // nonsense from whatever happened to be in it.
    expect(() => parseWorkbook(wb, NOW)).toThrow(WorkbookShapeError);
    expect(() => parseWorkbook(wb, NOW)).toThrow(/Sheet1/);
  });

  it("refuses a Budget sheet with no Activities header", () => {
    const budget = budgetRows().map((row) => (row[0] === "Activities" ? ["Stuff"] : row));
    expect(() => importFixture({ budget })).toThrow(/Activities/);
  });

  it("refuses a Spending sheet with no Year row", () => {
    const spending = spendingRows().filter((row) => row[0] !== "Year");
    expect(() => importFixture({ spending })).toThrow(/Year/);
  });

  it("reports an empty activity block rather than substituting the seed", () => {
    const budget = budgetRows().filter(
      (row) => !["Gym", "Arabic", "Aviation (~aprox)", "PC Maintenance", "Nebula"].includes(String(row[0])),
    );
    const { snapshot, warnings } = importFixture({ budget });
    // The old code filled in the seed's activities here, presenting invented
    // data as if it had come from the file.
    expect(snapshot.years[String(snapshot.settings.selectedYear)].activities).toEqual([]);
    expect(warnings.some((w) => w.includes("No activities"))).toBe(true);
  });
});

// ─── Identifiers ─────────────────────────────────────────────────────────────

describe("identifiers", () => {
  it("gives two imports of the same file entirely different ids", () => {
    const first = parseWorkbook(workbook(), NOW, "a.xlsx");
    const second = parseWorkbook(workbook(), NOW, "b.xlsx");

    const idsOf = (result: typeof first) => [
      ...result.snapshot.categories.map((c) => c.id),
      ...Object.values(result.snapshot.years).flatMap((y) => [
        ...y.activities.map((a) => a.id),
        ...y.spendingEntries.map((e) => e.id),
        ...y.wishlistItems.map((w) => w.id),
        ...y.walletEntries.map((w) => w.id),
      ]),
    ];

    // These are primary keys in tables shared by every account. Deriving them
    // from the file's contents is what let one budget overwrite another's rows
    // — the defect migration 006 exists to prevent.
    const firstIds = new Set(idsOf(first));
    expect(idsOf(second).filter((id) => firstIds.has(id))).toEqual([]);
  });

  it("points every imported row at a category this budget owns", () => {
    const { snapshot } = importFixture();
    const owned = new Set(snapshot.categories.map((c) => c.id));
    for (const year of Object.values(snapshot.years)) {
      for (const activity of year.activities) expect(owned.has(activity.categoryId)).toBe(true);
      for (const entry of year.spendingEntries) expect(owned.has(entry.categoryId)).toBe(true);
      for (const item of year.wishlistItems) expect(owned.has(item.categoryId)).toBe(true);
    }
  });
});
