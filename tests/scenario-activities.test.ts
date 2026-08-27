/**
 * Scenarios, without a Piloting assumption anywhere in them
 * ========================================================
 *
 * Four rules, and the whole point is that none of them names an activity:
 *
 *   enabled + paid by me     → contributes to the personal budget
 *   enabled + paid by other  → visible, contributes nothing to it
 *   enabled + outside budget → visible, contributes nothing to it
 *   disabled                 → contributes nothing at all
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  scenarioActivityCount,
  scenarioActivityFunding,
  scenarioActivityState,
  scenarioDiff,
  scenarioFromCurrentState,
  scenarioProjection,
} from "../src/domain/scenarios";
import { useBudgetStore } from "../src/store/budgetStore";
import { createEmptyBudgetSnapshot } from "../src/data/seedBudget";
import type { Activity, BudgetSnapshot, ScenarioPreset } from "../src/domain/types";

const NOW = new Date(2026, 7, 16);

function activity(name: string, monthly: number, overrides: Partial<Activity> = {}): Activity {
  return {
    id: `act-${name.toLowerCase()}`,
    name,
    categoryId: "cat-test",
    currency: "EUR",
    recurrenceType: "monthly",
    recurrenceInterval: 1,
    pricePerSession: null,
    pricePerPurchase: null,
    pricePerMonth: monthly,
    estimatedCost: null,
    yearlyEstimate: null,
    active: true,
    visible: true,
    seasonalTag: "normal",
    order: 0,
    notes: "",
    costModel: "fixed",
    ...overrides,
  };
}

function budget(activities: Activity[]): BudgetSnapshot {
  const snapshot = createEmptyBudgetSnapshot();
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.monthlyBudgetCurrency = "EUR";
  snapshot.settings.monthlyBudget = 1000;
  snapshot.years["2026"] = {
    year: 2026,
    activities: activities.map((item, index) => ({ ...item, order: index })),
    spendingEntries: [],
    wishlistItems: [],
    walletEntries: [],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  return snapshot;
}

function preset(partial: Partial<ScenarioPreset> = {}): ScenarioPreset {
  return { id: "sc-1", name: "Test", notes: "", ...partial };
}

const gym = activity("Gym", 100);
const lessons = activity("Lessons", 200);
const hangar = activity("Hangar", 300);

afterEach(() => {
  useBudgetStore.setState({ snapshot: createEmptyBudgetSnapshot(), undoStack: [], redoStack: [] });
});

describe("what a scenario says about an activity", () => {
  const snapshot = budget([gym, lessons, hangar]);

  it("defaults to enabled with the activity's own funding", () => {
    // A scenario saved before per-activity state existed said nothing about
    // any activity, and must keep meaning exactly what it always meant.
    const state = scenarioActivityState(preset(), gym.id);
    expect(state.enabled).toBe(true);
    expect(state.funding).toBeUndefined();
    expect(scenarioActivityFunding(preset(), gym)).toBe("personal");
  });

  it("honours an explicit disable", () => {
    const scenario = preset({ activityStates: { [gym.id]: { enabled: false } } });
    expect(scenarioActivityState(scenario, gym.id).enabled).toBe(false);
  });

  it("honours a funding override without touching the activity", () => {
    const scenario = preset({ activityStates: { [lessons.id]: { enabled: true, funding: "other" } } });
    expect(scenarioActivityFunding(scenario, lessons)).toBe("other");
    // The activity itself is unchanged: a scenario is a question, not an edit.
    expect(lessons.fundingSource).toBeUndefined();
  });
});

describe("the activity count", () => {
  it("reads 'X of Y activities enabled', generically", () => {
    const snapshot = budget([gym, lessons, hangar]);
    const scenario = preset({ activityStates: { [gym.id]: { enabled: false } } });
    const count = scenarioActivityCount(snapshot, scenario);
    expect(count.enabled).toBe(2);
    expect(count.total).toBe(3);
    expect(count.label).toBe("2 of 3 activities enabled");
  });

  it("counts against the activities that exist, not the ids the scenario names", () => {
    const snapshot = budget([gym]);
    // The scenario mentions two activities that were since deleted.
    const scenario = preset({
      activityStates: {
        [gym.id]: { enabled: true },
        "act-deleted-1": { enabled: true },
        "act-deleted-2": { enabled: true },
      },
    });
    expect(scenarioActivityCount(snapshot, scenario).total).toBe(1);
  });

  it("says so honestly when there are no activities at all", () => {
    expect(scenarioActivityCount(budget([]), preset()).label).toBe("0 of 0 activities enabled");
  });

  it("uses the singular for one", () => {
    expect(scenarioActivityCount(budget([gym]), preset()).label).toBe("1 of 1 activity enabled");
  });

  it("never mentions piloting", () => {
    const snapshot = budget([gym, lessons]);
    const label = scenarioActivityCount(snapshot, preset()).label;
    expect(label.toLowerCase()).not.toContain("pilot");
  });
});

describe("what a scenario costs", () => {
  const snapshot = budget([gym, lessons, hangar]);

  it("charges only enabled, personally funded activities to the budget", () => {
    const scenario = preset({
      activityStates: {
        [gym.id]: { enabled: true, funding: "personal" },
        [lessons.id]: { enabled: true, funding: "other" },
        [hangar.id]: { enabled: false },
      },
    });
    const projection = scenarioProjection(snapshot, scenario);

    expect(projection.personalMonthly).toBeCloseTo(100, 6);
    // Visible, and charged to nothing.
    expect(projection.otherFundedMonthly).toBeCloseTo(200, 6);
    // Enabled activities, whoever pays: 100 + 200. The disabled one is out.
    expect(projection.grossMonthly).toBeCloseTo(300, 6);
    expect(projection.disabledMonthly).toBeCloseTo(300, 6);
  });

  it("excludes outside-budget activities from the personal cost too", () => {
    const scenario = preset({
      activityStates: {
        [gym.id]: { enabled: true, funding: "outside" },
        [lessons.id]: { enabled: true, funding: "personal" },
        [hangar.id]: { enabled: true, funding: "personal" },
      },
    });
    const projection = scenarioProjection(snapshot, scenario);
    expect(projection.outsideBudgetMonthly).toBeCloseTo(100, 6);
    expect(projection.personalMonthly).toBeCloseTo(500, 6);
    expect(projection.grossMonthly).toBeCloseTo(600, 6);
  });

  it("contributes nothing at all when disabled, whatever its funding says", () => {
    const scenario = preset({
      activityStates: { [gym.id]: { enabled: false, funding: "personal" } },
    });
    const line = scenarioProjection(snapshot, scenario).lines.find((entry) => entry.activity.id === gym.id)!;
    expect(line.enabled).toBe(false);
    expect(line.personalMonthlyBase).toBe(0);
  });

  it("measures headroom against the scenario's own budget when it sets one", () => {
    const scenario = preset({
      monthlyBudget: 400,
      activityStates: {
        [gym.id]: { enabled: true, funding: "personal" },
        [lessons.id]: { enabled: true, funding: "personal" },
        [hangar.id]: { enabled: false },
      },
    });
    const projection = scenarioProjection(snapshot, scenario);
    expect(projection.monthlyBudget).toBe(400);
    expect(projection.headroom).toBeCloseTo(100, 6);
  });

  it("falls back to the current budget when the scenario does not set one", () => {
    expect(scenarioProjection(snapshot, preset()).monthlyBudget).toBe(1000);
  });
});

describe("the preview", () => {
  const snapshot = budget([gym, lessons]);

  it("reports a disabled activity as a change", () => {
    const changes = scenarioDiff(snapshot, preset({ activityStates: { [gym.id]: { enabled: false } } }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "activity-enabled", label: "Gym", before: true, after: false });
  });

  it("reports a funding override in words, not as a number", () => {
    const changes = scenarioDiff(
      snapshot,
      preset({ activityStates: { [lessons.id]: { enabled: true, funding: "other" } } }),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("activity-funding");
    expect(String(changes[0].after)).toMatch(/paid by other/i);
  });

  it("says nothing when the scenario restates what is already true", () => {
    const changes = scenarioDiff(
      snapshot,
      preset({ activityStates: { [gym.id]: { enabled: true, funding: "personal" } } }),
    );
    expect(changes).toEqual([]);
  });

  it("ignores a state naming an activity that no longer exists", () => {
    const changes = scenarioDiff(snapshot, preset({ activityStates: { "act-gone": { enabled: false } } }));
    expect(changes).toEqual([]);
  });
});

describe("applying a scenario", () => {
  it("switches activities on and off, and sets their funding", () => {
    const snapshot = budget([gym, lessons]);
    snapshot.scenarioPresets = [
      preset({
        activityStates: {
          [gym.id]: { enabled: false },
          [lessons.id]: { enabled: true, funding: "other" },
        },
      }),
    ];
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });

    useBudgetStore.getState().applyScenarioPreset("sc-1");

    const applied = useBudgetStore.getState().snapshot.years["2026"].activities;
    expect(applied.find((item) => item.id === gym.id)!.active).toBe(false);
    expect(applied.find((item) => item.id === lessons.id)!.fundingSource).toBe("other");
  });

  it("does not touch the Piloting setting, even when a legacy scenario stores one", () => {
    const snapshot = budget([gym]);
    snapshot.settings.pilotIncludedInBudget = true;
    snapshot.scenarioPresets = [preset({ pilotIncludedInBudget: false })];
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });

    useBudgetStore.getState().applyScenarioPreset("sc-1");

    // The preview does not list it, so applying it would change a setting the
    // user was never shown.
    expect(useBudgetStore.getState().snapshot.settings.pilotIncludedInBudget).toBe(true);
  });
});

describe("capturing the current state", () => {
  it("records every activity's own state, and names no activity in code", () => {
    const snapshot = budget([
      { ...gym, active: true },
      { ...lessons, active: false, fundingSource: "other" },
    ]);
    const captured = scenarioFromCurrentState(snapshot, "Now", "sc-new");

    expect(captured.activityStates![gym.id]).toEqual({ enabled: true, funding: "personal" });
    expect(captured.activityStates![lessons.id]).toEqual({ enabled: false, funding: "other" });
    expect(captured.pilotIncludedInBudget).toBeUndefined();
  });

  it("omits the map entirely when there are no activities", () => {
    // Absent and empty must stay one state, not two.
    expect(scenarioFromCurrentState(budget([]), "Empty", "sc-new").activityStates).toBeUndefined();
  });
});
