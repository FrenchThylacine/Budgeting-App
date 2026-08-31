export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Month ${month}`;
}

export function startOfIsoWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekOneMonday = new Date(jan4);
  weekOneMonday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const result = new Date(weekOneMonday);
  result.setUTCDate(weekOneMonday.getUTCDate() + (week - 1) * 7);
  return result;
}

export function getIsoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function weekYear(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  return target.getUTCFullYear();
}

export function weeksInIsoYear(year: number): number {
  const dec28 = new Date(Date.UTC(year, 11, 28));
  return getIsoWeek(dec28);
}

/**
 * Format a UTC-constructed date (e.g. `startOfIsoWeek`) as `YYYY-MM-DD`.
 * Do not use for "today" — see `todayDateInput`.
 */
export function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Today's date in the user's own timezone as `YYYY-MM-DD`.
 *
 * `new Date().toISOString()` converts to UTC first, so east of UTC it returns
 * *yesterday* during the early hours — dating a transaction to the wrong day,
 * and on the 1st of a month to the wrong month and budget period.
 */
export function todayDateInput(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function monthFromDateInput(value: string): number {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 1 : parsed.getMonth() + 1;
}

export function weekFromDateInput(value: string): number {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 1 : getIsoWeek(parsed);
}

export function isMonthClosed(year: number, month: number, now = new Date()): boolean {
  if (year < now.getFullYear()) return true;
  if (year > now.getFullYear()) return false;
  return month < now.getMonth() + 1;
}

export function isWeekClosed(year: number, week: number, now = new Date()): boolean {
  const currentIsoYear = weekYear(now);
  const currentWeek = getIsoWeek(now);
  if (year < currentIsoYear) return true;
  if (year > currentIsoYear) return false;
  return week < currentWeek;
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * Is `now` the last day of its own month, in the reader's own time zone?
 *
 * Asked by the wallet, which offers to move leftover budget into personal
 * money and should offer it on the one day the question is actually live.
 * Adding a day and seeing whether the month changed is the only version of
 * this that does not need a table of month lengths and a leap-year rule — the
 * platform already has both.
 *
 * Local, deliberately. A budget month ends when the reader's calendar says it
 * does, not when UTC agrees: on the 31st at 23:00 in Beirut it is still the
 * 31st for the person looking at the screen, and that is whose month it is.
 */
export function isLastDayOfMonth(now = new Date()): boolean {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return tomorrow.getMonth() !== now.getMonth();
}

/** The month a deferral belongs to, as a stable key: "2026-08". */
export function monthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
