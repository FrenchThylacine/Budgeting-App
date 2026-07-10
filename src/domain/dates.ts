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

export function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
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
