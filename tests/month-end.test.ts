import { describe, expect, it } from "vitest";
import { isLastDayOfMonth, monthKey } from "../src/domain/dates";

/**
 * The month ends when the reader's calendar says it does
 * ======================================================
 *
 * The wallet offers to move leftover budget into personal money. That offer
 * used to sit on the tab all month, which makes it a permanent notice rather
 * than a decision — the month's leftover is not final until the month is over,
 * so there is nothing to decide on the 3rd.
 *
 * Two things are easy to get wrong here and both are tested below: February,
 * which needs a leap-year rule that nobody should be writing by hand, and the
 * time zone. A budget month ends when the person looking at the screen says it
 * does; at 23:00 on the 31st in Beirut it is still the 31st for them, whatever
 * UTC thinks.
 */

/** Local noon, so no test here is a daylight-saving edge case in disguise. */
const at = (year: number, month: number, day: number) => new Date(year, month - 1, day, 12, 0, 0);

describe("the last day of the month", () => {
  it("recognises a 31-day month", () => {
    expect(isLastDayOfMonth(at(2026, 1, 31))).toBe(true);
    expect(isLastDayOfMonth(at(2026, 1, 30))).toBe(false);
  });

  it("recognises a 30-day month", () => {
    expect(isLastDayOfMonth(at(2026, 4, 30))).toBe(true);
    expect(isLastDayOfMonth(at(2026, 4, 29))).toBe(false);
  });

  it("gets February right in a common year", () => {
    expect(isLastDayOfMonth(at(2026, 2, 28))).toBe(true);
    expect(isLastDayOfMonth(at(2026, 2, 27))).toBe(false);
  });

  it("gets February right in a leap year", () => {
    // 2024 is a leap year: the 28th is not the last day, the 29th is.
    expect(isLastDayOfMonth(at(2024, 2, 28))).toBe(false);
    expect(isLastDayOfMonth(at(2024, 2, 29))).toBe(true);
  });

  it("gets the century rule right", () => {
    // 2000 was a leap year and 1900 was not, which is the rule a hand-written
    // month-length table gets wrong.
    expect(isLastDayOfMonth(at(2000, 2, 29))).toBe(true);
    expect(isLastDayOfMonth(at(1900, 2, 28))).toBe(true);
  });

  it("is true on the last day of December, and rolls the year", () => {
    expect(isLastDayOfMonth(at(2026, 12, 31))).toBe(true);
    expect(isLastDayOfMonth(at(2026, 12, 30))).toBe(false);
  });

  it("holds late in the evening, in local time", () => {
    // The case the naive UTC version fails: 23:00 local on the last day.
    expect(isLastDayOfMonth(new Date(2026, 7, 31, 23, 0, 0))).toBe(true);
    // And the first minute of the next month is not.
    expect(isLastDayOfMonth(new Date(2026, 8, 1, 0, 1, 0))).toBe(false);
  });
});

describe("the month a deferral belongs to", () => {
  it("is a padded year-month key", () => {
    expect(monthKey(at(2026, 8, 31))).toBe("2026-08");
    expect(monthKey(at(2026, 12, 1))).toBe("2026-12");
  });

  it("changes with the month, which is what makes next month a new question", () => {
    expect(monthKey(at(2026, 8, 31))).not.toBe(monthKey(at(2026, 9, 1)));
  });
});
