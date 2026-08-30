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
 *
 * `locale` is threaded in rather than left to the browser: the application
 * follows the language the user chose, and this label sits directly beside one
 * produced by `periodLabel`. Two neighbouring labels in two different languages
 * — which is exactly what happened — reads as a bug.
 */
export function periodRangeLabel(settings: Settings, locale?: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  if (settings.selectedPeriodMode === "year") {
    const start = new Date(Date.UTC(settings.selectedYear, 0, 1));
    const end = new Date(Date.UTC(settings.selectedYear, 11, 31));
    return `${formatter.format(start)} – ${formatter.format(end)}`;
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
export function currentPeriodLabel(settings: Settings, now = new Date(), locale?: string): string {
  return periodLabel({ ...settings, ...currentPeriodPatch(settings, now) } as Settings, locale);
}

/**
 * The period's name: "August 2026", "2026", "Week 33 · 10–16 Aug".
 *
 * The month name comes from `Intl` against the given locale, not from the
 * English-only `monthName()`. Without the locale it followed the browser's,
 * which is how a French interface came to show "August 2026" directly above
 * "1 août 2026 – 31 août 2026".
 */
export function periodLabel(settings: Settings, locale?: string): string {
  if (settings.selectedPeriodMode === "year") return String(settings.selectedYear);
  if (settings.selectedPeriodMode === "month") {
    const month = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(settings.selectedYear, settings.selectedMonth - 1, 1)),
    );
    return `${month} ${settings.selectedYear}`;
  }
  const start = startOfIsoWeek(selectedIsoWeekYear(settings), settings.selectedWeek);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${weekLabel(settings.selectedWeek, locale)} · ${formatter.format(start)}–${formatter.format(end)}`;
}

/**
 * "Week 33", in the reader's language.
 *
 * A tiny table rather than a translation key: this module is imported by the
 * server's validation and by tests, and giving it a dependency on the
 * dictionary for one word would be the wrong trade.
 */
function weekLabel(week: number, locale?: string): string {
  const words: Record<string, string> = { en: "Week", fr: "Semaine", es: "Semana", de: "Woche", ar: "الأسبوع" };
  const word = words[(locale ?? "en").split("-")[0]] ?? words.en;
  return `${word} ${week}`;
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

/**
 * A stable, language-independent name for a period, for storage.
 *
 * `periodLabel` produces "August 2026" — which is a *display* string, and the
 * audit trail was storing it. A record written in a French session then read
 * "juillet 2026" for ever, in every language, exactly like the wallet ledger
 * used to. This is what goes in the database; `formatPeriodToken` turns it back
 * into words at the moment somebody reads it.
 */
export function periodToken(settings: Settings): string {
  if (settings.selectedPeriodMode === "year") return `year:${settings.selectedYear}`;
  if (settings.selectedPeriodMode === "week") {
    return `week:${selectedIsoWeekYear(settings)}-W${String(settings.selectedWeek).padStart(2, "0")}`;
  }
  return `month:${settings.selectedYear}-${String(settings.selectedMonth).padStart(2, "0")}`;
}

/**
 * A stored token as words, in the reader's language.
 *
 * Anything that is not a token is returned unchanged: rows written before this
 * existed hold a finished English string, and rewriting saved records to change
 * their format would destroy history to tidy a format.
 */
export function formatPeriodToken(token: string, locale?: string): string {
  const [kind, value] = token.split(":");
  if (!value) return token;
  if (kind === "year") return value;
  if (kind === "month") {
    const [year, month] = value.split("-").map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return token;
    return periodLabel(
      { selectedPeriodMode: "month", selectedYear: year, selectedMonth: month } as Settings,
      locale,
    );
  }
  if (kind === "week") {
    const [year, week] = value.split("-W").map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return token;
    return periodLabel(
      { selectedPeriodMode: "week", selectedWeekYear: year, selectedYear: year, selectedWeek: week } as Settings,
      locale,
    );
  }
  return token;
}
