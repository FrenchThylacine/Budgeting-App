import { describe, expect, it } from "vitest";
import { isStoredText, resolveStoredText, storedText } from "../src/domain/storedText";

/**
 * The rule this encoding exists to keep: **a record is stored once and read in
 * whatever language the reader is using at the time**, and the user's own words
 * are never touched.
 */

const dictionary: Record<string, string> = {
  "audit.activityAdded": "Added activity {name}.",
  "audit.walletReset": "Reset the wallet balance to zero.",
  "wallet.allocationSource": "Budget for {month} {year}",
  "audit.seasonCaptured_one": "Captured from {count} activity.",
  "audit.seasonCaptured_other": "Captured from {count} activities.",
};

/** A translator that behaves like the real one for the two things used here. */
const t = (key: string, params?: Record<string, string | number | null | undefined>): string => {
  let template = dictionary[key];
  if (params && typeof params.count !== "undefined") {
    template = dictionary[`${key}_${Number(params.count) === 1 ? "one" : "other"}`] ?? template;
  }
  if (template == null) return key;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params?.[name] == null ? whole : String(params[name]),
  );
};

describe("text the store writes and the interface reads", () => {
  it("round-trips a key with no values", () => {
    const stored = storedText("audit.walletReset");
    expect(stored).toBe("@audit.walletReset");
    expect(resolveStoredText(stored, t)).toBe("Reset the wallet balance to zero.");
  });

  it("round-trips named values", () => {
    const stored = storedText("audit.activityAdded", { name: "Padel" });
    expect(resolveStoredText(stored, t)).toBe("Added activity Padel.");
  });

  it("survives a name containing the characters the encoding uses", () => {
    // The reason values are percent-encoded: a category legitimately called
    // "Food | Drink" would otherwise be parsed as two more parameters.
    const stored = storedText("audit.activityAdded", { name: "Food | Drink = 50%" });
    expect(resolveStoredText(stored, t)).toBe("Added activity Food | Drink = 50%.");
  });

  it("pluralises through the translator, which is where plural rules live", () => {
    expect(resolveStoredText(storedText("audit.seasonCaptured", { count: 1 }), t)).toBe("Captured from 1 activity.");
    expect(resolveStoredText(storedText("audit.seasonCaptured", { count: 4 }), t)).toBe("Captured from 4 activities.");
  });

  it("drops a null value rather than writing the word null", () => {
    expect(storedText("audit.activityAdded", { name: null })).toBe("@audit.activityAdded");
  });

  it("leaves anything a user typed exactly as they typed it", () => {
    // The whole point of the sigil. A note is theirs, and a dictionary must
    // never rewrite it — including a note that happens to look like a key.
    for (const text of ["Winwing Orion throttle", "audit.walletReset", "Budget for August", ""]) {
      expect(resolveStoredText(text, t)).toBe(text);
      expect(isStoredText(text)).toBe(false);
    }
  });

  it("still reads the positional form already in people's databases", () => {
    // Written before this module existed. Rewriting saved rows to change their
    // encoding would destroy history in order to tidy a format.
    expect(resolveStoredText("@wallet.allocationSource|August|2026", t)).toBe("Budget for August 2026");
  });

  it("prints the key rather than a blank when a translation is missing", () => {
    expect(resolveStoredText("@audit.somethingNew", t)).toBe("audit.somethingNew");
  });
});
