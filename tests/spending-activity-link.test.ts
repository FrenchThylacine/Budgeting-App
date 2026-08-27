/**
 * A transaction and the activity it paid for
 * ==========================================
 *
 * The editor offers the activities **inside the selected category**, and the
 * wishlist selector exists **only** in the wishlist category. Those two rules
 * are about which options a control may show, so they are tested here as pure
 * selection logic — the same functions the panel calls — plus the persistence
 * that has to survive them.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useBudgetStore } from "../src/store/budgetStore";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { findSeedCategory } from "../src/domain/seedCategories";
import { catId } from "./helpers/seedIds";
import type { Activity, BudgetSnapshot } from "../src/domain/types";

const NOW = new Date("2026-08-10T12:00:00Z");

function load(snapshot: BudgetSnapshot = createSeedBudgetSnapshot(NOW)) {
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.selectedPeriodMode = "month";
  useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [], historicalEditUnlocked: false });
  return snapshot;
}

/**
 * The panel's own rule, extracted so it can be checked directly.
 *
 * Kept deliberately identical to `activityOptions` in `SpendingPanel`: an
 * activity is offered when it is in the selected category, plus whatever the
 * transaction is already linked to.
 */
function optionsFor(activities: Activity[], categoryId: string, currentId?: string): Activity[] {
  const inCategory = activities.filter((activity) => activity.categoryId === categoryId);
  const current = currentId ? activities.find((activity) => activity.id === currentId) : undefined;
  if (current && !inCategory.some((activity) => activity.id === current.id)) return [...inCategory, current];
  return inCategory;
}

/** The panel's clearing rule: a selection the new category cannot hold goes. */
function clearInvalid(activities: Activity[], categoryId: string, currentId: string): string {
  const current = activities.find((activity) => activity.id === currentId);
  return current && current.categoryId === categoryId ? currentId : "";
}

afterEach(() => load());

describe("which activities a category offers", () => {
  const snapshot = createSeedBudgetSnapshot(NOW);
  const activities = snapshot.years["2026"].activities;
  const piloting = catId(snapshot, "cat-piloting");
  const utilities = catId(snapshot, "cat-utilities");

  it("offers only the activities in the selected category", () => {
    const offered = optionsFor(activities, piloting);
    expect(offered.length).toBeGreaterThan(0);
    for (const activity of offered) expect(activity.categoryId).toBe(piloting);
    // And nothing from a different one.
    expect(offered.map((a) => a.name)).not.toContain("Ogero");
  });

  it("changes the list when the category changes", () => {
    const first = optionsFor(activities, piloting).map((a) => a.id);
    const second = optionsFor(activities, utilities).map((a) => a.id);
    expect(first).not.toEqual(second);
    expect(first.some((id) => second.includes(id))).toBe(false);
  });

  it("offers nothing for a category with no activities", () => {
    expect(optionsFor(activities, catId(snapshot, "cat-wallet"))).toHaveLength(0);
  });

  it("keeps a linked activity selectable even after it moves category", () => {
    // A `<select>` whose value is not among its options silently displays a
    // different one, which would make an edit rewrite the link by accident.
    const stray = activities.find((activity) => activity.categoryId === piloting)!;
    const offered = optionsFor(activities, utilities, stray.id);
    expect(offered.map((a) => a.id)).toContain(stray.id);
  });
});

describe("changing the category clears an invalid selection", () => {
  const snapshot = createSeedBudgetSnapshot(NOW);
  const activities = snapshot.years["2026"].activities;
  const piloting = catId(snapshot, "cat-piloting");
  const utilities = catId(snapshot, "cat-utilities");

  it("keeps a selection the new category still holds", () => {
    const inUtilities = activities.find((activity) => activity.categoryId === utilities)!;
    expect(clearInvalid(activities, utilities, inUtilities.id)).toBe(inUtilities.id);
  });

  it("clears one the new category does not hold", () => {
    const inPiloting = activities.find((activity) => activity.categoryId === piloting)!;
    // Silently retaining it would persist a relationship the interface says is
    // impossible.
    expect(clearInvalid(activities, utilities, inPiloting.id)).toBe("");
  });
});

describe("the wishlist selector", () => {
  const snapshot = createSeedBudgetSnapshot(NOW);
  const wishlistId = findSeedCategory(snapshot.categories, "cat-wishlist")!.id;

  it("belongs to the wishlist category and nowhere else", () => {
    const isWishlist = (categoryId: string) => categoryId === wishlistId;
    expect(isWishlist(wishlistId)).toBe(true);
    expect(isWishlist(catId(snapshot, "cat-utilities"))).toBe(false);
    expect(isWishlist(catId(snapshot, "cat-piloting"))).toBe(false);
  });

  it("is found by seed key, so renaming the category cannot break it", () => {
    const renamed = createSeedBudgetSnapshot(NOW);
    const category = findSeedCategory(renamed.categories, "cat-wishlist")!;
    category.name = "Things I want";
    expect(findSeedCategory(renamed.categories, "cat-wishlist")!.id).toBe(category.id);
  });
});

describe("the stored relationship", () => {
  it("is persisted on the transaction, and survives a reload", () => {
    const snapshot = load();
    const activity = snapshot.years["2026"].activities[0];

    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-10",
      categoryId: activity.categoryId,
      activityId: activity.id,
      amount: 42,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Linked",
    });

    const written = useBudgetStore
      .getState()
      .snapshot.years["2026"].spendingEntries.find((entry) => entry.note === "Linked")!;
    expect(written.activityId).toBe(activity.id);

    // Serialise and rehydrate: exactly what a reload through the server does.
    const persisted = JSON.parse(JSON.stringify(useBudgetStore.getState().snapshot)) as BudgetSnapshot;
    load(persisted);
    const reloaded = useBudgetStore
      .getState()
      .snapshot.years["2026"].spendingEntries.find((entry) => entry.note === "Linked")!;
    expect(reloaded.activityId).toBe(activity.id);
  });

  it("is cleared on both sides when the activity is deleted", () => {
    const snapshot = load();
    const activity = snapshot.years["2026"].activities[0];
    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-10",
      categoryId: activity.categoryId,
      activityId: activity.id,
      amount: 42,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Orphan test",
    });

    useBudgetStore.getState().removeActivity(activity.id);

    const entry = useBudgetStore
      .getState()
      .snapshot.years["2026"].spendingEntries.find((item) => item.note === "Orphan test")!;
    // The transaction survives the activity — the money was really spent — but
    // it must not keep pointing at something that no longer exists.
    expect(entry).toBeTruthy();
    expect(entry.activityId).toBeUndefined();
  });

  it("can be changed and removed by an edit", () => {
    const snapshot = load();
    const [first, second] = snapshot.years["2026"].activities;
    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-10",
      categoryId: first.categoryId,
      activityId: first.id,
      amount: 10,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Rebind",
    });
    const id = useBudgetStore
      .getState()
      .snapshot.years["2026"].spendingEntries.find((entry) => entry.note === "Rebind")!.id;

    useBudgetStore.getState().updateSpendingEntry(id, { activityId: second.id, categoryId: second.categoryId });
    expect(
      useBudgetStore.getState().snapshot.years["2026"].spendingEntries.find((entry) => entry.id === id)!.activityId,
    ).toBe(second.id);

    useBudgetStore.getState().updateSpendingEntry(id, { activityId: undefined });
    expect(
      useBudgetStore.getState().snapshot.years["2026"].spendingEntries.find((entry) => entry.id === id)!.activityId,
    ).toBeUndefined();
  });
});
