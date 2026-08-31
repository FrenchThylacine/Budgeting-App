import type * as XLSXTypes from "xlsx";
import { dateInputValue, getIsoWeek, startOfIsoWeek, weeksInIsoYear, weekYear } from "./dates";
import { seedCategoryIdOrFallback } from "./seedCategories";
import { createSeedBudgetSnapshot } from "../data/seedBudget";
import type {
  Activity,
  BudgetSnapshot,
  CurrencyCode,
  RecurrenceType,
  SeedCategoryKey,
  SpendingEntry,
  WalletEntry,
  WishlistItem,
  YearRecord,
} from "./types";

/**
 * Import of the original "Budget Full" workbook.
 *
 * Rewritten against the real file rather than an assumed layout. The previous
 * version addressed cells by hardcoded row number *and* read the sheet with
 * `blankrows: false`, which drops empty rows — so every index below the first
 * blank row was silently off. Measured on the actual workbook, it lost the
 * first two activities (Gym and Arabic), the first two wishlist items (the two
 * most expensive), the first ten weeks of spending, and three of the four
 * years; and it read the personal balance as 0 because the cell says "€339.39".
 *
 * Everything here is therefore located by its header text, and anything that
 * cannot be located is an error rather than a silent default.
 */

export interface WorkbookImportSummary {
  years: number[];
  activities: number;
  wishlistItems: number;
  spendingEntries: number;
  walletEntries: number;
  /** Sum of imported spending, per currency, for eyeballing against the file. */
  spendingByCurrency: Record<string, number>;
}

export interface WorkbookImportResult {
  snapshot: BudgetSnapshot;
  summary: WorkbookImportSummary;
  /**
   * Things worth telling the user that are not failures — a row skipped, a
   * block deliberately not imported. Surfaced in the preview so an import is
   * never quietly lossy.
   */
  warnings: ImportWarning[];
}

/** A spreadsheet that does not look like the expected workbook. */
export class WorkbookShapeError extends Error {
  /**
   * The message, as a translation key and its values.
   *
   * `Error` needs a `message` — it is what a stack trace and a test failure
   * print — so one is still built in English for the developer. What reaches
   * the screen is `key` and `params`, because a reader who opened the wrong
   * file is owed the explanation in their own language.
   */
  readonly key: string;
  readonly params: Record<string, string | number>;

  constructor(message: string, key: string, params: Record<string, string | number> = {}) {
    super(message);
    this.name = "WorkbookShapeError";
    this.key = key;
    this.params = params;
  }
}

/**
 * A note about the file, for the import preview.
 *
 * A key and its values rather than a sentence. These are read on screen by
 * somebody deciding whether to accept an import, and they used to be assembled
 * here in English — including two that chose "has" or "have" and "year" or
 * "years" for themselves, which is a grammar no other language shares.
 */
export interface ImportWarning {
  key: string;
  params?: Record<string, string | number>;
  /** Plural count, for the dictionaries that need one. */
  count?: number;
}

type SheetRows = unknown[][];

/**
 * Sheet helpers for callers that already have the library — the tests, which
 * build a workbook in memory and pass it straight to `parseWorkbook`.
 *
 * Production always goes through `importBudgetWorkbook`, which imports `xlsx`
 * dynamically and hands its `utils` in, so the library still stays out of the
 * initial bundle.
 */
function requireUtils(): typeof XLSXTypes.utils {
  throw new Error(
    "parseWorkbook needs XLSX.utils. Call importBudgetWorkbook(), or pass utils explicitly.",
  );
}

/**
 * Identifiers for the rows an import creates.
 *
 * They must be unique per budget, not per file. `activities.id`,
 * `spending_entries.id`, `wishlist_items.id` and `wallet_entries.id` are
 * primary keys in tables shared by every account, so deriving them from the
 * file's contents means two people importing the same workbook — or one person
 * importing it into two budgets — collide on every row. That is the defect
 * migration 006 exists to prevent, and it must not be reintroduced here.
 *
 * Injectable so tests can be deterministic.
 */
export type ImportIdFactory = (prefix: string) => string;

function defaultImportId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

// ─── Cell readers ────────────────────────────────────────────────────────────

/**
 * A number, or null when the cell holds no number.
 *
 * Returning null rather than 0 is the whole point. `0` is a real amount — a
 * week with no spending — and the workbook uses empty cells, "N/A" and "NaN"
 * for "not known". Collapsing those to 0 would invent data: it turns an unknown
 * balance into a stated zero balance, and the app can no longer tell them
 * apart.
 *
 * Handles the formats the file actually contains: plain numbers, "$41.67",
 * "€30.00", "4,620.00", and "1 250,00" from locales that swap the separators.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let text = value.trim();
  if (text === "") return null;
  if (/^(n\/?a|nan|—|-|–)$/i.test(text)) return null;

  // Currency symbols, codes, and non-breaking spaces.
  text = text.replace(/[€$£¥]|EUR|USD|GBP|L\.L\.|LBP/gi, "").replace(/[\s  ]/g, "");

  const negative = /^\(.*\)$/.test(text);
  if (negative) text = text.slice(1, -1);

  // "1.234,56" (comma decimal) vs "1,234.56" (period decimal): whichever
  // separator comes last is the decimal point.
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    text = lastComma > lastDot
      ? text.replace(/\./g, "").replace(",", ".")
      : text.replace(/,/g, "");
  } else if (lastComma > -1) {
    // A lone comma is a decimal point unless it is grouping three digits.
    text = /,\d{3}$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  }

  if (text === "" || text === "-") return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function textValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text === "" ? null : text;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = textValue(value)?.toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function currencyValue(value: unknown): CurrencyCode | null {
  const text = textValue(value)?.toUpperCase();
  if (!text) return null;
  const known: CurrencyCode[] = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"];
  return known.find((code) => text.includes(code)) ?? null;
}

/** Case- and space-insensitive comparison, for matching header text. */
function normalizeLabel(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[\s ]+/g, " ").trim();
}

// ─── Locating things by header text ──────────────────────────────────────────

function findRowIndex(rows: SheetRows, matches: (row: unknown[]) => boolean, from = 0): number {
  for (let index = from; index < rows.length; index += 1) {
    if (matches(rows[index] ?? [])) return index;
  }
  return -1;
}

function findColumnIndex(row: unknown[], labels: string[]): number {
  const wanted = labels.map(normalizeLabel);
  return row.findIndex((cell) => wanted.includes(normalizeLabel(cell)));
}

/**
 * The value in the cell to the right of a label, searched across a row.
 *
 * The workbook puts metadata in label/value pairs along its first row
 * ("EUR/USD rate:" then 1.19), and those pairs move as columns are added.
 */
function valueAfterLabel(row: unknown[], labels: string[]): unknown {
  const wanted = labels.map(normalizeLabel);
  for (let index = 0; index < row.length; index += 1) {
    const cell = normalizeLabel(row[index]).replace(/:$/, "");
    if (wanted.includes(cell)) return row[index + 1];
  }
  return undefined;
}

function readSheet(workbook: XLSXTypes.WorkBook, sheetName: string, utils: typeof XLSXTypes.utils): SheetRows {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    // The old code fell back to the first sheet, which produced confident
    // nonsense from whatever happened to be there.
    const contains = workbook.SheetNames.join(", ");
    throw new WorkbookShapeError(
      `This file has no "${sheetName}" sheet. It contains: ${contains || "no sheets"}.`,
      contains ? "import.error.noSheet" : "import.error.noSheetsAtAll",
      { sheet: sheetName, contains },
    );
  }
  // blankrows preserved: the layout has blank separator rows, and dropping them
  // shifts everything below. Nothing here depends on absolute row numbers any
  // more, but keeping them makes the sheet match what the user sees.
  return utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
    defval: null,
  }) as SheetRows;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function importBudgetWorkbook(
  file: File,
  now = new Date(),
  makeId: ImportIdFactory = defaultImportId,
): Promise<WorkbookImportResult> {
  // Loaded here rather than at module scope: `xlsx` is the largest dependency
  // in the bundle and is needed only when a file is actually opened.
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  return parseWorkbook(workbook, now, file.name, makeId, XLSX.utils);
}

/** Split out from the file read so tests can drive it from a buffer. */
export function parseWorkbook(
  workbook: XLSXTypes.WorkBook,
  now = new Date(),
  sourceName = "workbook",
  makeId: ImportIdFactory = defaultImportId,
  /** Passed in so the caller owns the dynamic import of the library. */
  utils: typeof XLSXTypes.utils = requireUtils(),
): WorkbookImportResult {
  const warnings: ImportWarning[] = [];
  const budgetRows = readSheet(workbook, "Budget", utils);
  const spendingRows = readSheet(workbook, "Spending", utils);
  const timestamp = now.toISOString();

  // Categories come from a fresh seed so their ids belong to this budget.
  const base = createSeedBudgetSnapshot(now);
  const categoryId = (key: SeedCategoryKey): string =>
    seedCategoryIdOrFallback(base.categories, key) ?? "";

  const meta = parseMetadata(budgetRows, spendingRows, warnings);
  const activities = parseActivities(budgetRows, categoryId, warnings, makeId);
  const wishlistItems = parseWishlist(budgetRows, timestamp, categoryId("cat-wishlist"), warnings, makeId);
  const spending = parseSpending(spendingRows, timestamp, categoryId("cat-spending"), warnings, makeId);

  if (activities.length === 0) {
    // The old code substituted the seed's activities here, which is worse than
    // an empty import: it presents invented data as if it came from the file.
    warnings.push({ key: "import.warning.noActivities" });
  }

  const years = spending.years.length > 0 ? [...spending.years] : [meta.primaryYear];
  const primaryYear = years.includes(meta.primaryYear) ? meta.primaryYear : years[0];

  const yearRecords: Record<string, YearRecord> = {};
  for (const year of years) {
    const entries = spending.entriesByYear.get(year) ?? [];
    yearRecords[String(year)] = {
      year,
      // Activities and the wishlist describe the plan, which the workbook
      // states once rather than per year. They are attached to the primary year
      // only; copying them into every year would multiply the committed budget
      // by four.
      activities: year === primaryYear ? activities : [],
      spendingEntries: entries,
      wishlistItems: year === primaryYear ? wishlistItems : [],
      walletEntries: year === primaryYear ? buildWalletEntries(meta, year, now, timestamp, makeId) : [],
      closedMonths: [],
      monthlyNotes: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  const snapshot: BudgetSnapshot = {
    ...base,
    settings: {
      ...base.settings,
      selectedYear: primaryYear,
      selectedMonth: now.getFullYear() === primaryYear ? now.getMonth() + 1 : 1,
      selectedWeek: now.getFullYear() === primaryYear ? getIsoWeek(now) : 1,
      selectedWeekYear: weekYear(now),
      monthlyBudget: meta.monthlyBudget ?? base.settings.monthlyBudget,
      monthlyBudgetCurrency: base.settings.baseCurrency,
      exchangeRates: {
        ...base.settings.exchangeRates,
        eurUsd: meta.eurUsd ?? base.settings.exchangeRates.eurUsd,
        usdLbp: meta.usdLbp ?? base.settings.exchangeRates.usdLbp,
      },
      lastUpdated: timestamp,
    },
    years: yearRecords,
    // Approvals are permanent historical records of decisions made in this app.
    // A spreadsheet contains none, and inventing them would be fabrication.
    budgetApprovals: [],
    auditLog: [
      {
        id: makeId("audit"),
        type: "import",
        summary: `Imported ${sourceName}.`,
        createdAt: timestamp,
        metadata: { source: sourceName, years },
      },
    ],
  };

  const spendingByCurrency: Record<string, number> = {};
  for (const record of Object.values(yearRecords)) {
    for (const entry of record.spendingEntries) {
      spendingByCurrency[entry.currency] = (spendingByCurrency[entry.currency] ?? 0) + entry.amount;
    }
  }

  return {
    snapshot,
    summary: {
      years,
      activities: activities.length,
      wishlistItems: wishlistItems.length,
      spendingEntries: Object.values(yearRecords).reduce((n, r) => n + r.spendingEntries.length, 0),
      walletEntries: Object.values(yearRecords).reduce((n, r) => n + r.walletEntries.length, 0),
      spendingByCurrency,
    },
    warnings,
  };
}

// ─── Metadata ────────────────────────────────────────────────────────────────

interface WorkbookMetadata {
  eurUsd: number | null;
  usdLbp: number | null;
  monthlyBudget: number | null;
  personalBalance: number | null;
  primaryYear: number;
}

function parseMetadata(
  budgetRows: SheetRows,
  spendingRows: SheetRows,
  warnings: ImportWarning[],
): WorkbookMetadata {
  const budgetHeader = budgetRows[0] ?? [];
  const spendingHeader = spendingRows[0] ?? [];

  const eurUsd = parseAmount(valueAfterLabel(budgetHeader, ["eur/usd rate", "eur/usd"]))
    ?? parseAmount(valueAfterLabel(spendingHeader, ["eur/usd rate", "eur/usd"]));
  const usdLbp = parseAmount(valueAfterLabel(spendingHeader, ["usd/l.l. rate", "usd/ll rate", "usd/lbp rate"]));

  // "€339.39" in the real file — a string, which is exactly what defeated the
  // previous parser and turned an unknown balance into a stated zero.
  const personalBalance = parseAmount(valueAfterLabel(budgetHeader, ["personal balance"]));
  if (personalBalance == null) {
    warnings.push({ key: "import.warning.noPersonalBalance" });
  }

  // The budget figure is the "No Piloting" balance, which the workbook places
  // on the Balance row next to its own label.
  const balanceRowIndex = findRowIndex(budgetRows, (row) => normalizeLabel(row[0]).startsWith("balance"));
  const monthlyBudget = balanceRowIndex === -1
    ? null
    : parseAmount(valueAfterLabel(budgetRows[balanceRowIndex] ?? [], ["no piloting"]));
  if (monthlyBudget == null) {
    warnings.push({ key: "import.warning.noMonthlyBudget" });
  }

  const yearRow = findYearRow(spendingRows);
  const firstYear = yearRow === -1
    ? null
    : (spendingRows[yearRow] ?? []).map(parseAmount).find(isPlausibleYear) ?? null;

  return {
    eurUsd,
    usdLbp,
    monthlyBudget,
    personalBalance,
    primaryYear: firstYear ?? new Date().getFullYear(),
  };
}

function isPlausibleYear(value: number | null | undefined): value is number {
  return value != null && Number.isInteger(value) && value >= 1970 && value <= 2200;
}

function buildWalletEntries(
  meta: WorkbookMetadata,
  year: number,
  now: Date,
  timestamp: string,
  makeId: ImportIdFactory,
): WalletEntry[] {
  if (meta.personalBalance == null) return [];
  return [
    {
      id: makeId("wallet"),
      year,
      month: now.getFullYear() === year ? now.getMonth() + 1 : 1,
      amount: meta.personalBalance,
      currency: "EUR",
      source: "Personal Balance",
      type: "opening",
      note: "Imported from the Budget sheet header.",
      createdAt: timestamp,
    },
  ];
}

// ─── Activities ──────────────────────────────────────────────────────────────

const BLOCK_TERMINATORS = ["total", "balance:", "balance", "total δ:", "total δ+wants:"];

function isTerminator(name: string): boolean {
  return BLOCK_TERMINATORS.includes(normalizeLabel(name));
}

function parseActivities(
  budgetRows: SheetRows,
  categoryId: (key: SeedCategoryKey) => string,
  warnings: ImportWarning[],
  makeId: ImportIdFactory,
): Activity[] {
  const headerIndex = findRowIndex(budgetRows, (row) => normalizeLabel(row[0]) === "activities");
  if (headerIndex === -1) {
    throw new WorkbookShapeError(
      'The Budget sheet has no "Activities" header cell, so its activity block could not be located.',
      "import.error.noActivitiesHeader",
    );
  }
  const header = budgetRows[headerIndex] ?? [];

  const currencyCol = findColumnIndex(header, ["currency"]);
  const perSessionCol = findColumnIndex(header, ["per session"]);
  const perMonthCol = findColumnIndex(header, ["per month"]);
  const perYearCol = findColumnIndex(header, ["per year"]);

  const activities: Activity[] = [];
  for (let index = headerIndex + 1; index < budgetRows.length; index += 1) {
    const row = budgetRows[index] ?? [];
    const name = textValue(row[0]);
    if (!name) break;
    if (isTerminator(name)) break;

    const currency = (currencyCol === -1 ? null : currencyValue(row[currencyCol])) ?? "EUR";
    const perSession = perSessionCol === -1 ? null : parseAmount(row[perSessionCol]);
    const perMonth = perMonthCol === -1 ? null : parseAmount(row[perMonthCol]);
    const yearly = perYearCol === -1 ? null : parseAmount(row[perYearCol]);

    if (perSession == null && perMonth == null && yearly == null) {
      warnings.push({ key: "import.warning.activityWithoutPrice", params: { name } });
      continue;
    }

    const category = categoryForActivity(name, categoryId);
    const recurrenceType = inferRecurrence(perSession, perMonth, yearly);
    const interval = recurrenceType === "session" && perSession
      ? Math.max(1, Math.round((perMonth ?? perSession) / perSession))
      : 1;

    activities.push({
      id: makeId("act"),
      name,
      categoryId: category,
      currency,
      recurrenceType,
      recurrenceInterval: interval,
      pricePerSession: perSession,
      pricePerPurchase: recurrenceType === "purchase" ? perSession ?? yearly : null,
      pricePerMonth: perMonth,
      estimatedCost: perMonth ?? yearly ?? perSession,
      yearlyEstimate: yearly,
      active: true,
      visible: true,
      seasonalTag: category === categoryId("cat-piloting") ? "travel" : "normal",
      order: activities.length,
      notes: "Imported from the Budget sheet activity block.",
    });
  }

  return activities;
}

function inferRecurrence(
  perSession: number | null,
  perMonth: number | null,
  yearly: number | null,
): RecurrenceType {
  if (perSession != null && perMonth != null) return "session";
  if (perMonth != null) return "monthly";
  if (yearly != null && perSession == null) return "yearly";
  if (perSession != null || yearly != null) return "purchase";
  return "none";
}

function categoryForActivity(name: string, categoryId: (key: SeedCategoryKey) => string): string {
  const lower = name.toLowerCase();
  if (lower.includes("aviation") || lower.includes("navigraph") || lower.includes("pilot")) return categoryId("cat-piloting");
  if (lower.includes("gym")) return categoryId("cat-health");
  if (lower.includes("arabic")) return categoryId("cat-learning");
  if (lower.includes("alpha") || lower.includes("ogero")) return categoryId("cat-utilities");
  if (lower.includes("nebula")) return categoryId("cat-software");
  if (lower.includes("pc")) return categoryId("cat-tech");
  return categoryId("cat-other");
}

// ─── Wishlist ────────────────────────────────────────────────────────────────

function parseWishlist(
  budgetRows: SheetRows,
  timestamp: string,
  categoryId: string,
  warnings: ImportWarning[],
  makeId: ImportIdFactory,
): WishlistItem[] {
  const headerIndex = findRowIndex(
    budgetRows,
    (row) => findColumnIndex(row, ["what i want", "wishlist item", "item"]) !== -1,
  );
  if (headerIndex === -1) {
    warnings.push({ key: "import.warning.noWishlistColumn" });
    return [];
  }
  const header = budgetRows[headerIndex] ?? [];

  const nameCol = findColumnIndex(header, ["what i want", "wishlist item", "item"]);
  const priceCol = findColumnIndex(header, ["price"]);
  const boughtCol = findColumnIndex(header, ["bought"]);
  // "Whislist" is the spelling in the original workbook; both are accepted so
  // the import does not break if it is ever corrected.
  const inWishlistCol = findColumnIndex(header, ["whislist", "wishlist"]);

  const items: WishlistItem[] = [];
  for (let index = headerIndex + 1; index < budgetRows.length; index += 1) {
    const row = budgetRows[index] ?? [];
    const name = textValue(row[nameCol]);
    if (!name) break;
    if (isTerminator(name)) break;

    const price = priceCol === -1 ? null : parseAmount(row[priceCol]);
    const bought = boughtCol !== -1 && booleanValue(row[boughtCol]);
    const inWishlist = inWishlistCol !== -1 && booleanValue(row[inWishlistCol]);

    items.push({
      id: makeId("wish"),
      name,
      categoryId,
      actualPrice: price,
      // Only an item still wanted and not yet bought counts toward the total.
      effectiveValue: price != null && inWishlist && !bought ? price : 0,
      currency: "EUR",
      bought,
      inWishlist,
      // "Dream" is the LOWEST priority in this app, so an expensive item is not
      // promoted to the top of the list by its price alone.
      priority: price != null && price > 500 ? "dream" : "medium",
      dateAdded: timestamp,
      datePurchased: bought ? timestamp : undefined,
      notes: "Imported from the Budget sheet wishlist block.",
      active: true,
    });
  }

  return items;
}

// ─── Spending ────────────────────────────────────────────────────────────────

interface SpendingParseResult {
  years: number[];
  entriesByYear: Map<number, SpendingEntry[]>;
}

function findYearRow(spendingRows: SheetRows): number {
  return findRowIndex(spendingRows, (row) => {
    if (normalizeLabel(row[0]) !== "year") return false;
    return row.some((cell) => isPlausibleYear(parseAmount(cell)));
  });
}

function parseSpending(
  spendingRows: SheetRows,
  timestamp: string,
  categoryId: string,
  warnings: ImportWarning[],
  makeId: ImportIdFactory,
): SpendingParseResult {
  const entriesByYear = new Map<number, SpendingEntry[]>();

  const yearRowIndex = findYearRow(spendingRows);
  if (yearRowIndex === -1) {
    throw new WorkbookShapeError(
      'The Spending sheet has no "Year" row listing the years, so its columns could not be located.',
      "import.error.noYearRow",
    );
  }
  const yearRow = spendingRows[yearRowIndex] ?? [];

  // The row of column labels under the years, e.g. "Week # | L.L. + USD | EUR".
  const labelRowIndex = findRowIndex(
    spendingRows,
    (row) => normalizeLabel(row[0]).startsWith("week"),
    yearRowIndex + 1,
  );
  if (labelRowIndex === -1) {
    throw new WorkbookShapeError('The Spending sheet has no "Week #" header row.', "import.error.noWeekRow");
  }
  const labelRow = spendingRows[labelRowIndex] ?? [];

  const yearColumns: { year: number; usdCol: number; eurCol: number }[] = [];
  yearRow.forEach((cell, index) => {
    const year = parseAmount(cell);
    if (!isPlausibleYear(year)) return;
    // Each year owns a group of three columns and its label sits over the
    // middle one. Which of them is which is read from the labels rather than
    // assumed, so a reordered workbook still imports correctly.
    const group = [index - 1, index, index + 1].filter((c) => c >= 0);
    const usdCol = group.find((c) => /usd|\$|l\.l\./i.test(String(labelRow[c] ?? ""))) ?? index - 1;
    const eurCol = group.find((c) => /eur|€/i.test(String(labelRow[c] ?? ""))) ?? index;
    yearColumns.push({ year, usdCol, eurCol });
  });

  if (yearColumns.length === 0) {
    throw new WorkbookShapeError('The "Year" row contains no recognisable year.', "import.error.noRecognisableYear");
  }

  // Collected rather than reported one by one: the sheet lays out 55 week rows
  // for every year, so a per-row warning would bury the ones that matter under
  // fifteen copies of the same note.
  const outOfRangeWeeks = new Set<string>();

  for (const { year, usdCol, eurCol } of yearColumns) {
    const entries: SpendingEntry[] = [];
    const maxWeek = weeksInIsoYear(year);

    for (let index = labelRowIndex + 1; index < spendingRows.length; index += 1) {
      const row = spendingRows[index] ?? [];
      const label = textValue(row[0]);
      if (!label) continue;
      // The weekly block ends at its own "Total" row; below it the workbook
      // repeats the same figures as monthly totals, which must not be imported
      // as well or every amount would be counted twice.
      if (isTerminator(label)) break;

      const week = parseAmount(label.replace(/week/i, ""));
      if (week == null || !Number.isInteger(week) || week < 1) continue;
      if (week > maxWeek) {
        // The sheet always prints 55 week rows; a calendar year has 52 or 53.
        // The surplus rows are layout, not data.
        outOfRangeWeeks.add(String(week));
        continue;
      }

      const date = dateInputValue(startOfIsoWeek(year, week));
      const month = new Date(`${date}T00:00:00`).getMonth() + 1;

      // Null means the cell is empty or says N/A — genuinely unknown, and left
      // out. Zero means a week with no spending, which is a real record and is
      // kept.
      const usd = usdCol >= 0 ? parseAmount(row[usdCol]) : null;
      const eur = eurCol >= 0 ? parseAmount(row[eurCol]) : null;

      if (usd != null) {
        entries.push(entry(makeId("spend"), year, month, week, date, usd, "USD", timestamp, "L.L. + USD", categoryId));
      }
      if (eur != null) {
        entries.push(entry(makeId("spend"), year, month, week, date, eur, "EUR", timestamp, "EUR", categoryId));
      }
    }

    if (entries.length > 0) entriesByYear.set(year, entries);
  }

  if (outOfRangeWeeks.size > 0) {
    const weeks = [...outOfRangeWeeks].map(Number).sort((a, b) => a - b);
    warnings.push({
      key: "import.warning.weeksOutOfRange",
      params: { weeks: weeks.join(", ") },
      count: weeks.length,
    });
  }

  const withData = [...entriesByYear.keys()].sort((a, b) => a - b);
  const empty = yearColumns.filter((c) => !entriesByYear.has(c.year)).map((c) => c.year);
  if (empty.length > 0) {
    warnings.push({
      key: "import.warning.emptyYears",
      params: { years: empty.join(", ") },
      count: empty.length,
    });
    for (const year of empty) entriesByYear.set(year, []);
  }

  return { years: [...new Set([...withData, ...empty])].sort((a, b) => a - b), entriesByYear };
}

function entry(
  id: string,
  year: number,
  month: number,
  week: number,
  date: string,
  amount: number,
  currency: CurrencyCode,
  timestamp: string,
  label: string,
  categoryId: string,
): SpendingEntry {
  return {
    id,
    year,
    month,
    week,
    date,
    categoryId,
    amount,
    currency,
    recurrenceType: "none",
    isPiloting: false,
    source: "personal",
    note: `Imported ${label} value for week ${week}.`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
