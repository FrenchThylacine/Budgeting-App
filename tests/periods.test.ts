import { describe, expect, it } from "vitest";
import { getIsoWeek, weekYear, weeksInIsoYear } from "../src/domain/dates";
import { movePeriod, periodPatchForMode, selectedIsoWeekYear } from "../src/domain/periods";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { isViewingHistoricalPeriod } from "../src/utils/formatters";

describe("shared period semantics", () => {
  it("uses Monday-start ISO weeks across a year boundary", () => {
    expect(getIsoWeek(new Date("2021-01-01T12:00:00Z"))).toBe(53);
    expect(weekYear(new Date("2021-01-01T12:00:00Z"))).toBe(2020);
    expect(getIsoWeek(new Date("2021-01-04T12:00:00Z"))).toBe(1);
    expect(weekYear(new Date("2021-01-04T12:00:00Z"))).toBe(2021);
    expect(weeksInIsoYear(2020)).toBe(53);
  });

  it("recognizes past ISO weeks even within the current calendar month", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    const snapshot = createSeedBudgetSnapshot(now);
    snapshot.settings.selectedPeriodMode = "week";
    snapshot.settings.selectedYear = weekYear(now);
    snapshot.settings.selectedWeekYear = weekYear(now);
    snapshot.settings.selectedWeek = getIsoWeek(now) - 1;

    expect(isViewingHistoricalPeriod(snapshot.settings, now)).toBe(true);
  });

  it("does not mistake an explicit zero-spend current week for a historical period", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    const snapshot = createSeedBudgetSnapshot(now);
    snapshot.settings.selectedPeriodMode = "week";
    snapshot.settings.selectedYear = weekYear(now);
    snapshot.settings.selectedWeekYear = weekYear(now);
    snapshot.settings.selectedWeek = getIsoWeek(now);

    expect(isViewingHistoricalPeriod(snapshot.settings, now)).toBe(false);
  });

  it("keeps an ISO week-year separate from its calendar-month record", () => {
    const snapshot = createSeedBudgetSnapshot(new Date("2021-01-04T12:00:00Z"));
    snapshot.settings.selectedYear = 2021;
    snapshot.settings.selectedMonth = 1;

    const weekPatch = periodPatchForMode(snapshot.settings, "week");
    expect(weekPatch).toMatchObject({ selectedWeek: 2, selectedWeekYear: 2021 });

    snapshot.settings = { ...snapshot.settings, ...weekPatch };
    const previous = movePeriod(snapshot.settings, -1);
    expect(previous).toMatchObject({ selectedWeek: 1, selectedWeekYear: 2021, selectedYear: 2021, selectedMonth: 1 });
    expect(selectedIsoWeekYear({ ...snapshot.settings, ...previous })).toBe(2021);
  });

  it("moves backward from ISO week 1 to week 53 of the prior ISO year", () => {
    const snapshot = createSeedBudgetSnapshot(new Date("2021-01-04T12:00:00Z"));
    snapshot.settings.selectedPeriodMode = "week";
    snapshot.settings.selectedWeek = 1;
    snapshot.settings.selectedWeekYear = 2021;

    expect(snapshot.settings.selectedPeriodMode).toBe("week");
    expect(snapshot.settings.selectedWeek).toBe(1);
    expect(movePeriod(snapshot.settings, -1)).toMatchObject({ selectedWeek: 53, selectedWeekYear: 2020, selectedYear: 2020, selectedMonth: 12 });
  });
});
