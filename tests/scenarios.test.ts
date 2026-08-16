/**
 * Scenario diffs.
 *
 * Applying a scenario rewrites the monthly budget, the piloting rule and every
 * category cap it names. That used to happen on one click with nothing shown,
 * so the only way to learn what a scenario contained was to apply it and
 * compare. These tests pin what the preview must report.
 */

import { describe, expect, it } from "vitest";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { isScenarioActive, scenarioDiff, scenarioFromCurrentState } from "../src/domain/scenarios";
import type { BudgetSnapshot, ScenarioPreset } from "../src/domain/types";

const NOW = new Date(2026, 7, 16);

function base(): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.monthlyBudget = 500;
  snapshot.settings.pilotIncludedInBudget = true;
  for (const category of snapshot.categories) category.monthlyCap = undefined;
  return snapshot;
}

function preset(partial: Partial<ScenarioPreset> = {}): ScenarioPreset {
  return { id: "sc-1", name: "Test", notes: "", ...partial };
}

describe("scenarioDiff", () => {
  it("reports a changed budget with both values", () => {
    const changes = scenarioDiff(base(), preset({ monthlyBudget: 400 }));
    expect(changes).toEqual([
      { kind: "budget", label: "Monthly budget", before: 500, after: 400 },
    ]);
  });

  it("says nothing about a setting the scenario does not mention", () => {
    // An absent field means "leave it alone". Reporting it as a change to
    // undefined would be both wrong and alarming.
    expect(scenarioDiff(base(), preset({}))).toEqual([]);
  });

  it("says nothing when the scenario restates what is already true", () => {
    const snapshot = base();
    const changes = scenarioDiff(snapshot, preset({ monthlyBudget: 500, pilotIncludedInBudget: true }));
    expect(changes).toEqual([]);
    expect(isScenarioActive(snapshot, preset({ monthlyBudget: 500 }))).toBe(true);
  });

  it("tolerates the float drift of a stored budget", () => {
    const snapshot = base();
    snapshot.settings.monthlyBudget = 600 / 1.19;
    // Stored and reloaded, this is not bit-identical to the same division done
    // again. A hundredth of a currency unit is below anything displayed.
    const changes = scenarioDiff(snapshot, preset({ monthlyBudget: 504.2016806722689 }));
    expect(changes).toEqual([]);
  });

  it("reports the piloting rule as counted or excluded", () => {
    const changes = scenarioDiff(base(), preset({ pilotIncludedInBudget: false }));
    expect(changes).toEqual([
      { kind: "piloting", label: "Piloting counted in the budget", before: true, after: false },
    ]);
  });

  it("reports each cap against its category, with its colour", () => {
    const snapshot = base();
    const category = snapshot.categories[0];
    const changes = scenarioDiff(snapshot, preset({ categoryCaps: { [category.id]: 120 } }));

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: "cap",
      label: category.name,
      before: null,
      after: 120,
      categoryId: category.id,
      categoryColor: category.color,
    });
  });

  it("distinguishes a cap of zero from no cap at all", () => {
    const snapshot = base();
    const category = snapshot.categories[0];
    category.monthlyCap = 0;
    // Zero is a real limit: spend nothing here. It must not read as "unset",
    // or a scenario could never express it.
    expect(scenarioDiff(snapshot, preset({ categoryCaps: { [category.id]: 0 } }))).toEqual([]);
    expect(scenarioDiff(snapshot, preset({ categoryCaps: { [category.id]: 50 } }))[0].before).toBe(0);
  });

  it("flags a cap for a category that no longer exists", () => {
    const changes = scenarioDiff(base(), preset({ categoryCaps: { "cat-deleted": 90 } }));
    // Silently dropping it would leave the user wondering why the scenario
    // does less than it says.
    expect(changes).toHaveLength(1);
    expect(changes[0].label).toMatch(/no longer exists/);
    expect(changes[0].categoryId).toBe("cat-deleted");
  });

  it("collects every change a scenario makes", () => {
    const snapshot = base();
    const [first, second] = snapshot.categories;
    const changes = scenarioDiff(
      snapshot,
      preset({
        monthlyBudget: 300,
        pilotIncludedInBudget: false,
        categoryCaps: { [first.id]: 50, [second.id]: 75 },
      }),
    );
    expect(changes).toHaveLength(4);
    expect(changes.filter((c) => c.kind === "cap")).toHaveLength(2);
  });
});

describe("scenarioFromCurrentState", () => {
  it("captures the budget, the piloting rule and every cap that is set", () => {
    const snapshot = base();
    snapshot.categories[0].monthlyCap = 80;
    snapshot.categories[1].monthlyCap = 0;

    const captured = scenarioFromCurrentState(snapshot, "Right now", "sc-new");

    expect(captured.monthlyBudget).toBe(500);
    expect(captured.pilotIncludedInBudget).toBe(true);
    // Zero is captured; unset categories are simply absent.
    expect(captured.categoryCaps).toEqual({
      [snapshot.categories[0].id]: 80,
      [snapshot.categories[1].id]: 0,
    });
  });

  it("omits caps entirely when none are set", () => {
    const captured = scenarioFromCurrentState(base(), "Plain", "sc-new");
    // Undefined, not {}: "no caps" and "an empty set of caps" must stay
    // distinguishable, or a captured scenario would claim to manage caps.
    expect(captured.categoryCaps).toBeUndefined();
  });

  it("reapplies as a no-op", () => {
    const snapshot = base();
    snapshot.categories[0].monthlyCap = 80;
    const captured = scenarioFromCurrentState(snapshot, "Right now", "sc-new");
    // The round trip that matters: saving where you are and applying it again
    // must change nothing.
    expect(scenarioDiff(snapshot, captured)).toEqual([]);
  });
});
