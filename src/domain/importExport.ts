import * as XLSX from "xlsx";
import { calculateYear, estimateActivity } from "./calculations";
import { todayDateInput } from "./dates";
import type { Activity, BudgetSnapshot } from "./types";

/**
 * Workbook import lives in `domain/workbookImport.ts`.
 *
 * The version that used to sit here addressed cells by fixed row number while
 * reading the sheet with `blankrows: false`, which drops empty rows — so every
 * index below the first blank one was off. Measured against the real file it
 * lost two activities, two wishlist items, the first ten weeks of spending and
 * four of the five years. The replacement locates everything by header text.
 */

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

function activityExport(activity: Activity, snapshot: BudgetSnapshot): Record<string, unknown> {
  const estimate = estimateActivity(activity, snapshot);
  return {
    ...activity,
    monthlyBase: estimate.monthlyBase,
    yearlyBase: estimate.yearlyBase,
    bucket: estimate.bucket,
  };
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
