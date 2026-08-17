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

/**
 * Settings patch that jumps to the period containing `now`, staying in the
 * mode the user is already using rather than switching it for them.
 */
export function currentPeriodPatch(settings: Settings, now = new Date()): Partial<Settings> {
  // `now` sits inside every mode's current period, so all period fields are
  // set together. Updating only year+month would leave the ISO week pointing
  // at whatever was selected before, and the header would report a week that
  // does not belong to the month being shown.
  const isoWeek = { selectedWeek: getIsoWeek(now), selectedWeekYear: weekYear(now) };

  if (settings.selectedPeriodMode === "year") {
    return { selectedYear: now.getFullYear(), ...isoWeek };
  }
  if (settings.selectedPeriodMode === "week") {
    return isoWeek;
  }
  return { selectedYear: now.getFullYear(), selectedMonth: now.getMonth() + 1, ...isoWeek };
}

/** True when the selected period already contains `now`. */
export function isAtCurrentPeriod(settings: Settings, now = new Date()): boolean {
  if (settings.selectedPeriodMode === "year") return settings.selectedYear === now.getFullYear();
  if (settings.selectedPeriodMode === "week") {
    return selectedIsoWeekYear(settings) === weekYear(now) && settings.selectedWeek === getIsoWeek(now);
  }
  return settings.selectedYear === now.getFullYear() && settings.selectedMonth === now.getMonth() + 1;
}

/**
 * Full date range of a period, e.g. "1–31 August 2026" or "10–16 Aug".
 * Lets the user tell a selected period apart from the real one at a glance.
 */
export function periodRangeLabel(settings: Settings): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (settings.selectedPeriodMode === "year") {
    return `1 Jan – 31 Dec ${settings.selectedYear}`;
  }
  if (settings.selectedPeriodMode === "week") {
    const start = startOfIsoWeek(selectedIsoWeekYear(settings), settings.selectedWeek);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  }
  const start = new Date(Date.UTC(settings.selectedYear, settings.selectedMonth - 1, 1));
  const end = new Date(Date.UTC(settings.selectedYear, settings.selectedMonth, 0));
  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

/** Label for the real-world period of the same mode, for comparison. */
export function currentPeriodLabel(settings: Settings, now = new Date()): string {
  return periodLabel({ ...settings, ...currentPeriodPatch(settings, now) } as Settings);
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

/**
 * A single increasing number for the selected period.
 *
 * Used to tell which way the view moved — forwards or backwards in time — so a
 * period change can animate in the direction it actually went. Comparing the
 * labels cannot do this ("March" against "February" is not an ordering), and
 * the call sites cannot either: the arrows know their direction but the month
 * and year dropdowns jump anywhere.
 *
 * The scale differs per mode, which is fine: only the sign of the difference is
 * ever read, and the mode cannot change without the ordinal changing too.
 */
export function periodOrdinal(settings: Settings): number {
  const mode = settings.selectedPeriodMode ?? "month";
  if (mode === "year") return settings.selectedYear;
  if (mode === "week") return selectedIsoWeekYear(settings) * 53 + (settings.selectedWeek ?? 1);
  return settings.selectedYear * 12 + (settings.selectedMonth ?? 1);
}
