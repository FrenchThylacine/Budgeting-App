/**
 * Swipe preferences.
 *
 * Configurable because the destructive action is the one people disagree
 * about: some want Delete under the thumb, others want it nowhere near it. A
 * gesture that removes something you did not mean to touch is not recovered by
 * picking a cleverer default.
 */

import { describe, expect, it } from "vitest";
import {
  AVAILABLE_ACTIONS,
  DEFAULT_GESTURES,
  gesturesFor,
  isDestructive,
} from "../src/domain/gestures";
import { createEmptyBudgetSnapshot } from "../src/data/seedBudget";

const settings = () => createEmptyBudgetSnapshot(new Date(2026, 7, 16)).settings;

describe("gesturesFor", () => {
  it("uses the defaults when nothing is stored", () => {
    // An account that never opened the settings has no stored value, and
    // writing a copy up front would freeze today's defaults into it forever.
    const base = settings();
    expect(base.gestures).toBeUndefined();
    expect(gesturesFor(base, "wishlist")).toEqual(DEFAULT_GESTURES.wishlist);
  });

  it("applies a stored preference", () => {
    const base = { ...settings(), gestures: { wishlist: { trailing: "edit" as const } } };
    expect(gesturesFor(base, "wishlist").trailing).toBe("edit");
  });

  it("fills the direction a stored preference does not mention", () => {
    // A value written by a version that only knew one direction must not
    // silently disable the other.
    const base = { ...settings(), gestures: { wishlist: { trailing: "edit" as const } } };
    expect(gesturesFor(base, "wishlist").leading).toBe(DEFAULT_GESTURES.wishlist.leading);
  });

  it("keeps each list independent", () => {
    const base = { ...settings(), gestures: { spending: { trailing: "none" as const } } };
    expect(gesturesFor(base, "spending").trailing).toBe("none");
    expect(gesturesFor(base, "activities")).toEqual(DEFAULT_GESTURES.activities);
  });
});

describe("what each list can offer", () => {
  it("offers only actions the list can actually perform", () => {
    // Offering "Buy" on a transaction would be a control that does nothing.
    expect(AVAILABLE_ACTIONS.spending).not.toContain("buy");
    expect(AVAILABLE_ACTIONS.spending).not.toContain("archive");
    expect(AVAILABLE_ACTIONS.wishlist).toContain("buy");
    expect(AVAILABLE_ACTIONS.activities).toContain("archive");
  });

  it("always offers turning the gesture off", () => {
    for (const actions of Object.values(AVAILABLE_ACTIONS)) {
      expect(actions).toContain("none");
    }
  });

  it("defaults to something the list can perform", () => {
    for (const [surface, preference] of Object.entries(DEFAULT_GESTURES)) {
      const allowed = AVAILABLE_ACTIONS[surface as keyof typeof AVAILABLE_ACTIONS];
      expect(allowed).toContain(preference.trailing);
      expect(allowed).toContain(preference.leading);
    }
  });

  it("marks only deletion as destructive", () => {
    expect(isDestructive("delete")).toBe(true);
    for (const action of ["none", "archive", "buy", "edit", "duplicate"] as const) {
      expect(isDestructive(action)).toBe(false);
    }
  });
});
