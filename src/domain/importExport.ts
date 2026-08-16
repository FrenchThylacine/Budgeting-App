import * as XLSX from "xlsx";
import { calculateYear, estimateActivity } from "./calculations";
import { parseAmount } from "./currency";
import { dateInputValue, getIsoWeek, startOfIsoWeek, todayDateInput } from "./dates";
import type {
  Activity,
  BudgetSnapshot,
  CurrencyCode,
  RecurrenceType,
  SpendingEntry,
  WalletEntry,
  WishlistItem,
} from "./types";
import { createSeedBudgetSnapshot } from "../data/seedBudget";
import { seedCategoryIdOrFallback } from "./seedCategories";
import type { SeedCategoryKey } from "./types";

/**
 * Resolves a seed category key against the categories a specific budget owns.
 *
 * The importer used to write literal ids (`"cat-wishlist"`, `"cat-spending"`,
 * `"cat-piloting"`) into every row it produced. Those ids belonged to whichever
 * budget happened to be created first; in any other budget they name a category
 * that does not exist, and both `activities.category_id` and
 * `spending_entries.category_id` are `ON DELETE RESTRICT` foreign keys, so the
 * whole import transaction fails with an opaque constraint error.
 */
type CategoryResolver = (key: SeedCategoryKey) => string;

type SheetRows = unknown[][];

export async function importBudgetWorkbook(file: File, now = new Date()): Promise<BudgetSnapshot> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const budgetRows = rows(workbook, "Budget");
  const spendingRows = rows(workbook, "Spending");
  const snapshot = createSeedBudgetSnapshot(now);
  const timestamp = now.toISOString();
  const resolveCategory: CategoryResolver = (key) =>
    seedCategoryIdOrFallback(snapshot.categories, key) ?? "";
  const year = parseAmount(spendingRows[2]?.[2]) ?? snapshot.settings.selectedYear;
  const eurUsd = parseAmount(budgetRows[0]?.[7]) ?? snapshot.settings.exchangeRates.eurUsd;
  const usdLbp = parseAmount(spendingRows[0]?.[5]) ?? snapshot.settings.exchangeRates.usdLbp;
  const monthlyBudget = parseAmount(budgetRows[13]?.[4]) ?? snapshot.settings.monthlyBudget;
  const personalBalance = parseAmount(budgetRows[0]?.[9]) ?? 0;

  snapshot.settings.selectedYear = year;
  snapshot.settings.selectedMonth = now.getFullYear() === year ? now.getMonth() + 1 : 1;
  snapshot.settings.selectedWeek = now.getFullYear() === year ? getIsoWeek(now) : 1;
  snapshot.settings.monthlyBudget = monthlyBudget;
  snapshot.settings.monthlyBudgetCurrency = snapshot.settings.baseCurrency;
  snapshot.settings.exchangeRates = {
    ...snapshot.settings.exchangeRates,
    eurUsd,
    usdLbp,
  };
  snapshot.settings.lastUpdated = timestamp;

  snapshot.years = {
    [year]: {
      year,
      activities: parseActivities(budgetRows, resolveCategory),
      spendingEntries: parseSpending(spendingRows, year, timestamp, resolveCategory),
      wishlistItems: parseWishlist(budgetRows, timestamp, resolveCategory),
      walletEntries: [
        {
          id: `wallet-opening-${year}`,
          year,
          month: snapshot.settings.selectedMonth,
          amount: personalBalance,
          currency: snapshot.settings.baseCurrency,
          source: "Personal Balance",
          type: "opening",
          note: "Imported from the original workbook.",
          createdAt: timestamp,
        },
      ],
      closedMonths: [],
      monthlyNotes: {},
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };
  snapshot.auditLog.unshift({
    id: `audit-import-${Date.now()}`,
    type: "import",
    summary: `Imported ${file.name}.`,
    createdAt: timestamp,
    metadata: { fileName: file.name },
  });
  return snapshot;
}

export function exportAllYearsToExcel(snapshot: BudgetSnapshot): void {
  const workbook = XLSX.utils.book_new();
  const calculation = calculateYear(snapshot);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([
      { Metric: "Selected year", Value: calculation.year },
      { Metric: "General budget", Value: calculation.generalBudget },
      { Metric: "Piloting budget", Value: calculation.pilotingBudget },
      { Metric: "Included budget", Value: calculation.includedBudget },
      { Metric: "Monthly spend", Value: calculation.selectedMonthSpend.total ?? "NaN/Pending" },
      { Metric: "Delta", Value: calculation.delta ?? "NaN/Pending" },
      { Metric: "Wallet total", Value: calculation.wallet.walletTotal },
      { Metric: "Wishlist active total", Value: calculation.wishlist.activeTotal },
    ]),
    "Summary",
  );

  for (const record of Object.values(snapshot.years).sort((a, b) => a.year - b.year)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(record.activities.map((activity) => activityExport(activity, snapshot))),
      `${record.year} Activities`,
    );
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.spendingEntries), `${record.year} Spending`);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.wishlistItems), `${record.year} Wishlist`);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.walletEntries), `${record.year} Wallet`);
  }

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(snapshot.auditLog), "Audit Log");
  XLSX.writeFile(workbook, `premium-budget-all-years-${safeDate()}.xlsx`);
}

export function exportCurrentYearToExcel(snapshot: BudgetSnapshot): void {
  const workbook = XLSX.utils.book_new();
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  if (!record) return;
  const calculation = calculateYear(snapshot);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(calculation.monthlyTrend), "Monthly Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.activities.map((activity) => activityExport(activity, snapshot))), "Activities");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.spendingEntries), "Spending");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.wishlistItems), "Wishlist");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(record.walletEntries), "Wallet");
  XLSX.writeFile(workbook, `premium-budget-${record.year}-${safeDate()}.xlsx`);
}

export function exportJson(snapshot: BudgetSnapshot): void {
  downloadBlob(JSON.stringify(snapshot, null, 2), `premium-budget-backup-${safeDate()}.json`, "application/json");
}

export function exportWishlistCsv(snapshot: BudgetSnapshot): void {
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  if (!record) return;
  downloadBlob(toCsv(record.wishlistItems.map((item) => ({ ...item }))), `wishlist-${record.year}-${safeDate()}.csv`, "text/csv;charset=utf-8");
}

export function exportWalletCsv(snapshot: BudgetSnapshot): void {
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  if (!record) return;
  downloadBlob(toCsv(record.walletEntries.map((item) => ({ ...item }))), `wallet-${record.year}-${safeDate()}.csv`, "text/csv;charset=utf-8");
}

export async function importJsonBackup(file: File): Promise<BudgetSnapshot> {
  const text = await file.text();
  const parsed = JSON.parse(text) as BudgetSnapshot;
  if (!parsed || parsed.version !== 1 || !parsed.settings || !parsed.years) {
    throw new Error("This JSON file is not a Premium Budget OS backup.");
  }
  return parsed;
}

function rows(workbook: XLSX.WorkBook, sheetName: string): SheetRows {
  const sheet = workbook.Sheets[sheetName] ?? workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false }) as SheetRows;
}

function parseActivities(rowsValue: SheetRows, resolveCategory: CategoryResolver): Activity[] {
  const activities: Activity[] = [];
  for (let rowIndex = 4; rowIndex < rowsValue.length; rowIndex += 1) {
    const row = rowsValue[rowIndex] ?? [];
    const name = stringValue(row[0]);
    if (!name || ["Total", "Balance:", "Total Δ:", "Total Δ+Wants:"].includes(name)) break;
    const currency = currencyValue(row[1]) ?? "EUR";
    const perSession = parseAmount(row[2]);
    const perMonth = parseAmount(row[3]);
    const yearly = parseAmount(row[5]);
    const categoryId = categoryForActivity(name, resolveCategory);
    const recurrenceType = inferRecurrence(perSession, perMonth, yearly);
    const interval = recurrenceType === "session" && perSession ? Math.max(1, Math.round((perMonth ?? perSession) / perSession)) : 1;
    activities.push({
      id: slugId("act", name),
      name,
      categoryId,
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
      seasonalTag: categoryId === resolveCategory("cat-piloting") ? "travel" : "normal",
      order: activities.length,
      notes: "Imported from the Budget sheet activity block.",
    });
  }
  return activities.length > 0 ? activities : createSeedBudgetSnapshot().years["2026"].activities;
}

function parseWishlist(rowsValue: SheetRows, timestamp: string, resolveCategory: CategoryResolver): WishlistItem[] {
  const items: WishlistItem[] = [];
  for (let rowIndex = 4; rowIndex < rowsValue.length; rowIndex += 1) {
    const row = rowsValue[rowIndex] ?? [];
    const name = stringValue(row[8]);
    if (!name || name === "Total") break;
    const actualPrice = parseAmount(row[9]);
    const bought = booleanValue(row[10]);
    const inWishlist = booleanValue(row[11]);
    items.push({
      id: slugId("wish", name),
      name,
      categoryId: resolveCategory("cat-wishlist"),
      actualPrice,
      effectiveValue: actualPrice != null && inWishlist && !bought ? actualPrice : 0,
      currency: "EUR",
      bought,
      inWishlist,
      priority: actualPrice != null && actualPrice > 500 ? "dream" : "medium",
      dateAdded: timestamp,
      datePurchased: bought ? timestamp : undefined,
      notes: "Imported from the Budget sheet wishlist block.",
      active: true,
    });
  }
  return items;
}

function parseSpending(rowsValue: SheetRows, fallbackYear: number, timestamp: string, resolveCategory: CategoryResolver): SpendingEntry[] {
  const entries: SpendingEntry[] = [];
  const header = rowsValue[2] ?? [];
  const yearColumns = header
    .map((value, index) => ({ year: parseAmount(value), index }))
    .filter((item): item is { year: number; index: number } => item.year != null);

  for (const yearColumn of yearColumns.length ? yearColumns : [{ year: fallbackYear, index: 2 }]) {
    const groupStart = Math.max(1, yearColumn.index - 1);
    for (let rowIndex = 4; rowIndex < rowsValue.length; rowIndex += 1) {
      const row = rowsValue[rowIndex] ?? [];
      const weekLabel = stringValue(row[0]);
      if (!weekLabel?.startsWith("Week")) break;
      const week = parseAmount(weekLabel.replace("Week", "").trim());
      if (!week) continue;
      const usd = parseAmount(row[groupStart]);
      const eur = parseAmount(row[groupStart + 1]);
      const date = dateInputValue(startOfIsoWeek(yearColumn.year, week));
      const month = new Date(`${date}T00:00:00`).getMonth() + 1;
      const spendingCategoryId = resolveCategory("cat-spending");
      if (usd != null) entries.push(spendingEntry(yearColumn.year, month, week, date, usd, "USD", timestamp, "L.L. + USD", spendingCategoryId));
      if (eur != null) entries.push(spendingEntry(yearColumn.year, month, week, date, eur, "EUR", timestamp, "EUR", spendingCategoryId));
    }
  }
  return entries;
}

function spendingEntry(
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
    id: `spend-${year}-${week}-${currency.toLowerCase()}-${Math.random().toString(16).slice(2)}`,
    year,
    month,
    week,
    date,
    categoryId,
    amount,
    currency,
    recurrenceType: "none",
    isPiloting: false,
    note: `Imported ${label} value for Week ${week}.`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function inferRecurrence(perSession: number | null, perMonth: number | null, yearly: number | null): RecurrenceType {
  if (perSession != null && perMonth != null) return "session";
  if (perMonth != null) return "monthly";
  if (yearly != null && perSession == null) return "yearly";
  if (perSession != null || yearly != null) return "purchase";
  return "none";
}

function categoryForActivity(name: string, resolveCategory: CategoryResolver): string {
  const lower = name.toLowerCase();
  if (lower.includes("aviation") || lower.includes("navigraph") || lower.includes("pilot")) return resolveCategory("cat-piloting");
  if (lower.includes("gym")) return resolveCategory("cat-health");
  if (lower.includes("arabic")) return resolveCategory("cat-learning");
  if (lower.includes("alpha") || lower.includes("ogero")) return resolveCategory("cat-utilities");
  if (lower.includes("nebula")) return resolveCategory("cat-software");
  if (lower.includes("pc")) return resolveCategory("cat-tech");
  return resolveCategory("cat-other");
}

function activityExport(activity: Activity, snapshot: BudgetSnapshot): Record<string, unknown> {
  const estimate = estimateActivity(activity, snapshot);
  return {
    ...activity,
    monthlyBase: estimate.monthlyBase,
    yearlyBase: estimate.yearlyBase,
    bucket: estimate.bucket,
  };
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

function stringValue(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function currencyValue(value: unknown): CurrencyCode | null {
  const text = stringValue(value).replace(/\s/g, "").toUpperCase();
  const allowed: CurrencyCode[] = ["EUR", "USD", "LBP", "GBP", "CAD", "AUD", "JPY", "TRY", "SAR", "AED"];
  return allowed.includes(text as CurrencyCode) ? (text as CurrencyCode) : null;
}

function slugId(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function safeDate(): string {
  return todayDateInput();
}

function downloadBlob(content: string, fileName: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toCsv(rowsValue: Array<Record<string, unknown>>): string {
  if (rowsValue.length === 0) return "";
  const headers = Array.from(new Set(rowsValue.flatMap((row) => Object.keys(row))));
  const body = rowsValue.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  return [headers.join(","), ...body].join("\n");
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
