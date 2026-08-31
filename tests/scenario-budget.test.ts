import { describe, expect, it } from "vitest";
import { scenarioProjection, scenarioSuggestedBudget } from "../src/domain/scenarios";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, BudgetSnapshot, ScenarioPreset } from "../src/domain/types";

/**
 * A scenario's budget is derived, not typed
 * =========================================
 *
 * It used to be a number field with "leave empty to keep the current one"
 * under it — which asks somebody to work out what their own scenario costs,
 * from figures the application has already computed and is showing them on the
 * same sheet. And a typed figure goes stale: change an activity's price and
 * every scenario quietly keeps describing the old one.
 *
 * The basis is the **personal** monthly requirement, and that is the whole
 * reason to derive it rather than sum the activities. An activity somebody
 * else pays for costs real money and costs *this budget* nothing, so a
 * scenario that takes over a parent's subscription must move the budget and
 * one that merely renames it must not.
 */

function snapshotWith(activities: Partial<Activity>[]): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot();
  const year = String(snapshot.settings.selectedYear);
  snapshot.years[year].activities = activities.map((activity, index) => ({
    id: `a${index}`,
    name: `Activity ${index}`,
    categoryId: snapshot.categories[0].id,
    pricePerMonth: 0,
    currency: "EUR",
    recurrenceType: "monthly",
    recurrenceInterval: 1,
    active: true,
    visible: true,
    order: index,
    notes: "",
    costModel: "fixed",
    ...activity,
  })) as Activity[];
  return snapshot;
}

const preset = (states: ScenarioPreset["activityStates"]): ScenarioPreset => ({
  id: "s1",
  name: "Scenario",
  notes: "",
  activityStates: states,
});

describe("the budget a scenario needs", () => {
  it("is what its activities require, rounded up to a hundred", () => {
    const snapshot = snapshotWith([{ pricePerMonth: 120 }, { pricePerMonth: 130 }]);
    // 250 a month → a budget of 300, because a budget is a decision and
    // €250.00 exactly is a calculation wearing a decision's clothes.
    expect(scenarioSuggestedBudget(snapshot, preset({}))).toBe(300);
  });

  it("excludes an activity the scenario switches off", () => {
    const snapshot = snapshotWith([{ pricePerMonth: 120 }, { pricePerMonth: 130 }]);
    const off = preset({ a1: { enabled: false } });
    expect(scenarioProjection(snapshot, off).personalMonthly).toBe(120);
    expect(scenarioSuggestedBudget(snapshot, off)).toBe(200);
  });

  it("excludes an activity somebody else pays for", () => {
    /*
     * The case that makes this worth deriving at all. Both activities run and
     * both cost money; only one of them costs *this* budget anything.
     */
    const snapshot = snapshotWith([{ pricePerMonth: 120 }, { pricePerMonth: 130 }]);
    const shared = preset({ a1: { enabled: true, funding: "other" } });
    expect(scenarioProjection(snapshot, shared).personalMonthly).toBe(120);
    expect(scenarioSuggestedBudget(snapshot, shared)).toBe(200);
  });

  it("excludes money the reader keeps outside the budget", () => {
    const snapshot = snapshotWith([{ pricePerMonth: 120 }, { pricePerMonth: 130 }]);
    const outside = preset({ a0: { enabled: true, funding: "outside" } });
    expect(scenarioSuggestedBudget(snapshot, outside)).toBe(200);
  });

  it("counts an activity the scenario takes over from somebody else", () => {
    // The mirror of the case above: "what if my father stopped paying".
    const snapshot = snapshotWith([
      { pricePerMonth: 120, fundingSource: "other", fundedBy: "Dad" },
      { pricePerMonth: 130 },
    ]);
    expect(scenarioSuggestedBudget(snapshot, preset({}))).toBe(200);
    const mine = preset({ a0: { enabled: true, funding: "personal" } });
    expect(scenarioSuggestedBudget(snapshot, mine)).toBe(300);
  });

  it("is zero when the scenario runs nothing the reader pays for", () => {
    const snapshot = snapshotWith([{ pricePerMonth: 120, fundingSource: "other" }]);
    expect(scenarioSuggestedBudget(snapshot, preset({}))).toBe(0);
  });
});
