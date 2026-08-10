import type { PeriodMode, Settings } from "./types";
import { getIsoWeek, monthName, startOfIsoWeek, weekYear, weeksInIsoYear } from "./dates";

export function selectedIsoWeekYear(settings: Pick<Settings, "selectedYear" | "selectedWeekYear">): number {
  return settings.selectedWeekYear ?? settings.selectedYear;
}

export function currentIsoPeriod(now = new Date()): { year: number; week: number } {
  return { year: weekYear(now), week: getIsoWeek(now) };
}

export function periodPatchForMode(settings: Settings, nextMode: PeriodMode): Partial<Settings> {
  if (nextMode === settings.selectedPeriodMode) return {};
  if (nextMode === "week") {
    const date = new Date(Date.UTC(settings.selectedYear, settings.selectedMonth - 1, 15));
    return { selectedPeriodMode: nextMode, selectedWeek: getIsoWeek(date), selectedWeekYear: weekYear(date) };
  }
  if (settings.selectedPeriodMode === "week") {
    const anchor = startOfIsoWeek(selectedIsoWeekYear(settings), settings.selectedWeek);
    anchor.setUTCDate(anchor.getUTCDate() + 3);
    return { selectedPeriodMode: nextMode, selectedYear: anchor.getUTCFullYear(), selectedMonth: anchor.getUTCMonth() + 1 };
  }
  return { selectedPeriodMode: nextMode };
}

export function movePeriod(settings: Settings, delta: -1 | 1): Partial<Settings> {
  if (settings.selectedPeriodMode === "year") return { selectedYear: settings.selectedYear + delta };
  if (settings.selectedPeriodMode === "month") {
    const date = new Date(Date.UTC(settings.selectedYear, settings.selectedMonth - 1 + delta, 15));
    return { selectedYear: date.getUTCFullYear(), selectedMonth: date.getUTCMonth() + 1, selectedWeek: getIsoWeek(date), selectedWeekYear: weekYear(date) };
  }
  const isoYear = selectedIsoWeekYear(settings);
  let nextWeek = settings.selectedWeek + delta;
  let nextYear = isoYear;
  if (nextWeek < 1) { nextYear -= 1; nextWeek = weeksInIsoYear(nextYear); }
  else if (nextWeek > weeksInIsoYear(isoYear)) { nextYear += 1; nextWeek = 1; }
  const anchor = startOfIsoWeek(nextYear, nextWeek);
  anchor.setUTCDate(anchor.getUTCDate() + 3);
  return { selectedWeek: nextWeek, selectedWeekYear: nextYear, selectedYear: anchor.getUTCFullYear(), selectedMonth: anchor.getUTCMonth() + 1 };
}

export function isHistoricalPeriod(settings: Settings, now = new Date()): boolean {
  if (settings.selectedPeriodMode === "week") {
    const current = currentIsoPeriod(now);
    const selectedYear = selectedIsoWeekYear(settings);
    return selectedYear < current.year || (selectedYear === current.year && settings.selectedWeek < current.week);
  }
  if (settings.selectedPeriodMode === "year") return settings.selectedYear < now.getFullYear();
  return settings.selectedYear < now.getFullYear()
    || (settings.selectedYear === now.getFullYear() && settings.selectedMonth < now.getMonth() + 1);
}

export function periodLabel(settings: Settings): string {
  if (settings.selectedPeriodMode === "year") return String(settings.selectedYear);
  if (settings.selectedPeriodMode === "month") return `${monthName(settings.selectedMonth)} ${settings.selectedYear}`;
  const start = startOfIsoWeek(selectedIsoWeekYear(settings), settings.selectedWeek);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `Week ${settings.selectedWeek} · ${formatter.format(start)}–${formatter.format(end)}`;
}
