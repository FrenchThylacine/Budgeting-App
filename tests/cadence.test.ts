/**
 * One vocabulary for how often
 * ============================
 *
 * The application had six ways of saying "every month" — `recurrenceType`,
 * `costModel`, "Monthly · every 1", "billed once a year", "fixed monthly",
 * "session pack" — and on a transaction row it printed the stored enum value
 * itself. A reader met the same fact spelled differently on four screens.
 *
 * These tests pin the mapping, because the mapping is the vocabulary: if
 * `sessionPack` stops meaning `pack`, every screen goes back to disagreeing
 * quietly.
 */
import { describe, expect, it } from "vitest";
import { CADENCE_META, activityCadence, entryCadence, isRecurring, recurrenceCadence } from "../src/domain/cadence";
import type { Activity, SpendingEntry } from "../src/domain/types";

const activity = (patch: Partial<Activity>): Activity => ({ recurrenceType: "monthly", ...patch }) as Activity;

describe("an activity's cadence", () => {
  it("follows the cost model, which is what the money follows", () => {
    expect(activityCadence(activity({ costModel: "fixedYearly" }))).toBe("yearly");
    expect(activityCadence(activity({ costModel: "sessionPack" }))).toBe("pack");
    expect(activityCadence(activity({ costModel: "perSession" }))).toBe("session");
    expect(activityCadence(activity({ costModel: "schedule" }))).toBe("scheduled");
    expect(activityCadence(activity({ costModel: "fixed" }))).toBe("monthly");
  });

  it("falls back to the recurrence for an activity written before cost models", () => {
    expect(activityCadence(activity({ costModel: undefined, recurrenceType: "yearly" }))).toBe("yearly");
    expect(activityCadence(activity({ costModel: "auto", recurrenceType: "weekly" }))).toBe("weekly");
    expect(activityCadence(activity({ costModel: undefined, recurrenceType: "purchase" }))).toBe("oneOff");
  });

  it("does not lose the yearly model to the recurrence beneath it", () => {
    // A yearly subscription stored with a monthly recurrence — which the
    // editor can produce — is still yearly. The cost model wins.
    expect(activityCadence(activity({ costModel: "fixedYearly", recurrenceType: "monthly" }))).toBe("yearly");
  });
});

describe("a transaction's cadence", () => {
  const entry = (recurrenceType: SpendingEntry["recurrenceType"]) => ({ recurrenceType }) as SpendingEntry;

  it("is one-off unless it says otherwise", () => {
    expect(entryCadence(entry("none"))).toBe("oneOff");
    expect(entryCadence(entry("purchase"))).toBe("oneOff");
    expect(recurrenceCadence(undefined)).toBe("oneOff");
  });

  it("carries the repeat when there is one", () => {
    expect(entryCadence(entry("monthly"))).toBe("monthly");
    expect(entryCadence(entry("yearly"))).toBe("yearly");
  });
});

describe("the vocabulary itself", () => {
  it("gives every cadence a shape and a word, never a colour alone", () => {
    for (const meta of Object.values(CADENCE_META)) {
      expect(meta.icon, meta.id).toBeTruthy();
      expect(meta.labelKey, meta.id).toMatch(/^cadence\./);
      expect(meta.tone, meta.id).toMatch(/^var\(--cadence-/);
    }
  });

  it("uses distinct silhouettes, because two calendars are one calendar at 14px", () => {
    const icons = Object.values(CADENCE_META).map((meta) => meta.icon);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("groups seven cadences into three families rather than seven colours", () => {
    const tones = new Set(Object.values(CADENCE_META).map((meta) => meta.tone));
    expect(tones.size).toBe(3);
  });

  it("knows which of them repeat", () => {
    expect(isRecurring("monthly")).toBe(true);
    expect(isRecurring("pack")).toBe(true);
    expect(isRecurring("oneOff")).toBe(false);
  });
});
