/**
 * A new account starts empty.
 *
 * The demo budget is a fixture — someone else's gym membership, someone else's
 * wishlist. Starting a real account on it means deleting ten things before
 * recording the first real one, with no way to tell afterwards which figures
 * were yours.
 */

import { describe, expect, it } from "vitest";
import { createEmptyBudgetSnapshot, createSeedBudgetSnapshot } from "../src/data/seedBudget";

const NOW = new Date(2026, 7, 16);

describe("createEmptyBudgetSnapshot", () => {
  it("contains none of the demo data", () => {
    const snapshot = createEmptyBudgetSnapshot(NOW);
    const years = Object.values(snapshot.years);
    expect(years).toHaveLength(1);
    for (const year of years) {
      expect(year.activities).toEqual([]);
      expect(year.spendingEntries).toEqual([]);
      expect(year.wishlistItems).toEqual([]);
      expect(year.walletEntries).toEqual([]);
    }
    expect(snapshot.scenarioPresets).toEqual([]);
    expect(snapshot.seasonalPresets).toEqual([]);
    expect(snapshot.budgetApprovals).toEqual([]);
  });

  it("keeps the categories, because a budget with none cannot record anything", () => {
    const snapshot = createEmptyBudgetSnapshot(NOW);
    // Categories are the structure, not the data.
    expect(snapshot.categories.length).toBeGreaterThan(0);
    expect(snapshot.categories.every((category) => Boolean(category.seedKey))).toBe(true);
  });

  it("inherits no budget figure", () => {
    // A number nobody chose is worse than an empty field, because it looks
    // like a decision that was made.
    expect(createEmptyBudgetSnapshot(NOW).settings.monthlyBudget).toBe(0);
  });

  it("still gives every account its own identifiers", () => {
    const first = createEmptyBudgetSnapshot(NOW);
    const second = createEmptyBudgetSnapshot(NOW);
    const firstIds = new Set(first.categories.map((c) => c.id));
    // The same collision that let one budget overwrite another's rows.
    expect(second.categories.map((c) => c.id).filter((id) => firstIds.has(id))).toEqual([]);
  });

  it("leaves the demo fixture available for tests and demos", () => {
    // Removing it would break every fixture in the suite; it simply stops
    // being what a real account starts from.
    const seeded = createSeedBudgetSnapshot(NOW);
    expect(Object.values(seeded.years)[0].activities.length).toBeGreaterThan(0);
  });
});
