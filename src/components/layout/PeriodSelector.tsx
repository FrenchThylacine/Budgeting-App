import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, History } from "lucide-react";
import { getIsoWeek, monthName, weekYear, weeksInIsoYear } from "../../domain/dates";
import {
  currentPeriodPatch,
  isAtCurrentPeriod,
  isHistoricalPeriod,
  movePeriod,
  periodLabel,
  periodPatchForMode,
  periodRangeLabel,
  selectedIsoWeekYear,
} from "../../domain/periods";
import type { PeriodMode, Settings } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";

/**
 * The period selector
 * ===================
 * One line, four jobs: which kind of period, which one, one step either way,
 * and the way back to now.
 *
 * It has been three different things. It began as a permanent strip of a mode
 * toggle, two dropdowns and two arrows across the top of every page — a third
 * of the first viewport on a phone, spent on an action most sessions perform
 * once. It then became a collapsed widget in the header, which fixed the space
 * and cost the two things people need continuously: seeing the period and
 * stepping through it without opening anything.
 *
 * This is the third: a compact control bar in which *every* frequent action is
 * one press. The only thing behind a disclosure is jumping to an arbitrary
 * period, which is the rare case — and the popover that serves it is a month
 * grid and a year stepper rather than two native dropdowns that could never
 * show where you are in a year at a glance.
 *
 * Two structural rules it must keep:
 *
 *  - **It is above the historical indicator, and it receives the pointer.**
 *    The bar and its popover sit in the shell's own stacking context, so the
 *    popover can open over the banner below it. That used to be impossible:
 *    every child of the main area was given `z-index: 1`, which made each of
 *    them a stacking context, trapped the popover's `z-index: 40` inside the
 *    header's layer, and let the later sibling — the banner — paint over the
 *    whole thing and swallow the clicks.
 *
 *  - **It states the historical condition without being it.** The bar carries a
 *    small marker; the banner explains it. Two different jobs, two different
 *    elements, so neither has to compromise for the other.
 */

type PeriodPatch = Partial<Settings>;

const MODES: { value: PeriodMode; label: string; short: string }[] = [
  { value: "week", label: "Week", short: "W" },
  { value: "month", label: "Month", short: "M" },
  { value: "year", label: "Year", short: "Y" },
];

export const PeriodSelector: React.FC = () => {
  const settings = useBudgetStore((s) => s.snapshot.settings);
  const years = useBudgetStore((s) => s.snapshot.years);
  const updateSettings = useBudgetStore((s) => s.updateSettings);
  const selectYear = useBudgetStore((s) => s.selectYear);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const mode = settings.selectedPeriodMode ?? "month";
  const label = periodLabel(settings);
  const range = periodRangeLabel(settings);
  const atCurrent = isAtCurrentPeriod(settings);
  const historical = isHistoricalPeriod(settings);
  const activeYear = mode === "week" ? selectedIsoWeekYear(settings) : settings.selectedYear;
  // The real period of the same mode, so a historical view can never be
  // mistaken for the present one even when the banner is scrolled away.
  const currentLabel = periodLabel({ ...settings, ...currentPeriodPatch(settings) } as Settings);

  /**
   * The wall clock, refreshed each minute.
   *
   * A selector that can show any month has to say where "now" actually is, or a
   * view of March is indistinguishable from today in March. Minute resolution:
   * a ticking second is a re-render per second for a figure nobody reads, and
   * when the setting is off the timer is never started rather than merely
   * hidden.
   */
  const liveClock = settings.liveClockEnabled !== false;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!liveClock) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [liveClock]);

  const yearOptions = useMemo(() => {
    const known = Object.keys(years).map(Number);
    return Array.from(new Set([activeYear - 1, activeYear, activeYear + 1, ...known]))
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => a - b);
  }, [years, activeYear]);

  const apply = (patch: PeriodPatch) => {
    if (Object.keys(patch).length > 0) updateSettings(patch);
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      // Escape returns focus where it came from, or the page loses its place.
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const pickMonth = (month: number, year = settings.selectedYear) => {
    const date = new Date(Date.UTC(year, month - 1, 1));
    apply({
      selectedYear: year,
      selectedMonth: month,
      selectedWeek: getIsoWeek(date),
      selectedWeekYear: weekYear(date),
    });
    setOpen(false);
  };

  const pickWeek = (week: number) => {
    apply({ selectedWeek: week, selectedWeekYear: activeYear });
    setOpen(false);
  };

  const pickYear = (year: number) => {
    if (mode === "week") apply({ selectedWeekYear: year });
    else selectYear(year);
    if (mode === "year") setOpen(false);
  };

  return (
    <div className="period-bar" ref={containerRef}>
      {/* Mode. A segmented control rather than a dropdown: three options that
          change what everything else means should be visible at once. */}
      <div className="period-modes" role="group" aria-label="Period type">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`period-mode${mode === item.value ? " active" : ""}`}
            aria-pressed={mode === item.value}
            onClick={() => apply(periodPatchForMode(settings, item.value))}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="period-nav">
        <button
          type="button"
          className="period-step"
          aria-label={`Previous ${mode}`}
          onClick={() => apply(movePeriod(settings, -1))}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>

        <button
          ref={triggerRef}
          type="button"
          className="period-current"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="period-current-label">{label}</span>
          <span className="period-current-range text-footnote">{range}</span>
          <ChevronDown size={14} aria-hidden="true" className="period-current-chevron" />
        </button>

        <button
          type="button"
          className="period-step"
          aria-label={`Next ${mode}`}
          onClick={() => apply(movePeriod(settings, 1))}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {/* The state, stated on the control itself — so a past period is never
          silently identical to the present one, even with the banner below
          scrolled out of view. */}
      {historical && (
        <span
          className="period-flag"
          title={`This ${mode} has already ended. The current ${mode} is ${currentLabel}.`}
        >
          <History size={13} aria-hidden="true" />
          Past {mode}
        </span>
      )}

      <div className="period-now">
        <span className="period-today text-footnote">
          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(now)}
          {liveClock ? ` · ${new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(now)}` : ""}
        </span>
        <button
          type="button"
          className="period-jump"
          onClick={() => apply(currentPeriodPatch(settings))}
          disabled={atCurrent}
          title={atCurrent ? `Already on the current ${mode}` : `Go to the current ${mode}`}
        >
          <CalendarCheck size={14} aria-hidden="true" />
          <span>Current {mode}</span>
        </button>
      </div>

      {open && (
        <div className="period-panel" id={panelId} ref={panelRef} role="group" aria-label={`Choose a ${mode}`}>
          {/* The year, in every mode. In year mode it is the whole choice; in
              the other two it is the frame the months or weeks sit in, which is
              why it is a stepper rather than a list that scrolls away. */}
          <div className="period-panel-years">
            <button
              type="button"
              className="period-step"
              aria-label="Previous year"
              onClick={() => pickYear(activeYear - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <strong className="period-panel-year">{activeYear}</strong>
            <button
              type="button"
              className="period-step"
              aria-label="Next year"
              onClick={() => pickYear(activeYear + 1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          {mode === "month" && (
            <div className="period-grid period-grid-months" role="group" aria-label="Month">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <button
                  key={month}
                  type="button"
                  className={`period-cell${settings.selectedMonth === month ? " active" : ""}`}
                  aria-pressed={settings.selectedMonth === month}
                  onClick={() => pickMonth(month)}
                >
                  {monthName(month).slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {mode === "week" && (
            <div className="period-grid period-grid-weeks" role="group" aria-label="ISO week">
              {Array.from({ length: weeksInIsoYear(activeYear) }, (_, index) => index + 1).map((week) => (
                <button
                  key={week}
                  type="button"
                  className={`period-cell${settings.selectedWeek === week ? " active" : ""}`}
                  aria-pressed={settings.selectedWeek === week}
                  aria-label={`Week ${week}`}
                  onClick={() => pickWeek(week)}
                >
                  {week}
                </button>
              ))}
            </div>
          )}

          {mode === "year" && (
            <div className="period-grid period-grid-years" role="group" aria-label="Year">
              {yearOptions.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`period-cell${settings.selectedYear === year ? " active" : ""}`}
                  aria-pressed={settings.selectedYear === year}
                  onClick={() => {
                    selectYear(year);
                    setOpen(false);
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          {/* A year with data is not the same as a year that merely exists on
              the calendar, and the difference decides whether the page will be
              empty. Said once, here, rather than by an empty state later. */}
          {mode !== "week" && (
            <p className="period-panel-note text-note">
              {Object.keys(years).length > 0
                ? `Records exist for ${Object.keys(years).sort().join(", ")}.`
                : "No year has any records yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
