import type { BudgetSnapshot, ScenarioPreset } from "./types";

/**
 * What applying a scenario would change.
 *
 * Applying one rewrites the monthly budget, the piloting rule and every
 * category cap it names — and it was wired to a single "Apply" button with no
 * indication of any of that. A scenario is a planning tool, so seeing the
 * consequence before committing to it is the whole point; discovering it
 * afterwards means reconstructing caps by hand.
 */

export type ScenarioChangeKind = "budget" | "piloting" | "cap";

export interface ScenarioChange {
  kind: ScenarioChangeKind;
  /** Human label: "Monthly budget", or the category's name for a cap. */
  label: string;
  /** Current value, or null when nothing is set today. */
  before: number | boolean | null;
  after: number | boolean;
  /** Present for cap changes, so the UI can colour by category. */
  categoryId?: string;
  categoryColor?: string;
}

/** Values that differ. A scenario restating what is already true is not a change. */
export function scenarioDiff(snapshot: BudgetSnapshot, preset: ScenarioPreset): ScenarioChange[] {
  const changes: ScenarioChange[] = [];
  const settings = snapshot.settings;

  if (preset.monthlyBudget != null && !nearlyEqual(preset.monthlyBudget, settings.monthlyBudget)) {
    changes.push({
      kind: "budget",
      label: "Monthly budget",
      before: settings.monthlyBudget ?? null,
      after: preset.monthlyBudget,
    });
  }

  if (
    preset.pilotIncludedInBudget != null &&
    preset.pilotIncludedInBudget !== settings.pilotIncludedInBudget
  ) {
    changes.push({
      kind: "piloting",
      label: "Piloting counted in the budget",
      before: settings.pilotIncludedInBudget ?? null,
      after: preset.pilotIncludedInBudget,
    });
  }

  for (const [categoryId, cap] of Object.entries(preset.categoryCaps ?? {})) {
    const category = snapshot.categories.find((item) => item.id === categoryId);
    // A cap for a category that no longer exists cannot be applied, and saying
    // so is more useful than silently dropping it.
    if (!category) {
      changes.push({
        kind: "cap",
        label: "Cap for a category that no longer exists",
        before: null,
        after: cap,
        categoryId,
      });
      continue;
    }
    if (nearlyEqual(cap, category.monthlyCap)) continue;
    changes.push({
      kind: "cap",
      label: category.name,
      before: category.monthlyCap ?? null,
      after: cap,
      categoryId,
      categoryColor: category.color,
    });
  }

  return changes;
}

/**
 * Whether a scenario is already in effect.
 *
 * Used to mark the active one in the list, so applying the same scenario twice
 * is visibly a no-op rather than an action with an unknown result.
 */
export function isScenarioActive(snapshot: BudgetSnapshot, preset: ScenarioPreset): boolean {
  return scenarioDiff(snapshot, preset).length === 0;
}

/**
 * A scenario capturing what the budget looks like right now.
 *
 * Building one from the current state is how people actually create scenarios —
 * "save where I am before I try something" — and it removes any need to retype
 * a set of caps.
 */
export function scenarioFromCurrentState(
  snapshot: BudgetSnapshot,
  name: string,
  id: string,
): ScenarioPreset {
  const categoryCaps: Record<string, number> = {};
  for (const category of snapshot.categories) {
    if (category.monthlyCap != null && Number.isFinite(category.monthlyCap)) {
      categoryCaps[category.id] = category.monthlyCap;
    }
  }
  return {
    id,
    name,
    monthlyBudget: snapshot.settings.monthlyBudget,
    pilotIncludedInBudget: snapshot.settings.pilotIncludedInBudget,
    // Omitted rather than stored empty, so "no caps" and "caps that happen to
    // be empty" stay distinguishable.
    categoryCaps: Object.keys(categoryCaps).length > 0 ? categoryCaps : undefined,
    notes: "",
  };
}

/**
 * Floating-point money compares badly: a budget of 600/1.19 stored and reloaded
 * is not bit-identical to the same division done again. A hundredth of a
 * currency unit is below anything the app displays.
 */
function nearlyEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < 0.005;
}
