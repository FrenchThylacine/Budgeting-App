import { estimateActivity } from "./calculations";
import { activityFundingKind, FUNDING_META, type FundingKind } from "./funding";
import type { Activity, BudgetSnapshot, ScenarioActivityState, ScenarioPreset } from "./types";

/**
 * Scenarios
 * =========
 *
 * "What would this budget look like if…". A scenario stores a monthly budget,
 * category caps, and — per activity — whether it is running at all and who
 * pays for it.
 *
 * **There is no Piloting-specific control here any more.** There used to be
 * one: a boolean called `pilotIncludedInBudget`, presented in the editor, the
 * card and the preview. It assumed every budget has an activity called
 * Piloting, which almost none do, and it could express exactly one question
 * about exactly one hard-coded thing. The generic replacement — enable or
 * disable any activity, and override its funding — answers that question for
 * Piloting *and* for everything else, without naming anything.
 *
 * Applying one rewrites real settings, so `scenarioDiff` states every value
 * that will change before it happens.
 */

export type ScenarioChangeKind = "budget" | "cap" | "activity-enabled" | "activity-funding";

export interface ScenarioChange {
  kind: ScenarioChangeKind;
  /** Human label: "Monthly budget", or the category's or activity's name. */
  label: string;
  /** Current value, or null when nothing is set today. */
  before: number | boolean | string | null;
  after: number | boolean | string;
  /** Present for cap changes, so the UI can colour by category. */
  categoryId?: string;
  categoryColor?: string;
  /** Present for activity changes. */
  activityId?: string;
}

/** The state a scenario gives one activity: enabled, funded as the activity says. */
export const DEFAULT_ACTIVITY_STATE: ScenarioActivityState = { enabled: true };

/**
 * What a scenario says about one activity.
 *
 * An activity the scenario has never been told about is enabled and keeps its
 * own funding — which is precisely what a scenario saved before per-activity
 * state existed meant, and what a newly added activity should default to.
 */
export function scenarioActivityState(preset: ScenarioPreset, activityId: string): ScenarioActivityState {
  const stored = preset.activityStates?.[activityId];
  if (!stored) return DEFAULT_ACTIVITY_STATE;
  return { enabled: stored.enabled !== false, funding: stored.funding };
}

/** How an activity is funded *inside* this scenario. */
export function scenarioActivityFunding(preset: ScenarioPreset, activity: Activity): FundingKind {
  return scenarioActivityState(preset, activity.id).funding ?? activityFundingKind(activity);
}

export interface ScenarioActivityCount {
  enabled: number;
  total: number;
  /**
   * The English sentence, for the report and for any non-React caller.
   *
   * The **interface** does not use this: it passes `enabled` and `total` to
   * `t("scenarios.activityCount", …)`, because a sentence assembled here
   * printed "3 of 4 activities enabled" on a French card. A domain module has
   * no business choosing a language.
   */
  label: string;
}

/**
 * How many of the budget's activities this scenario switches on.
 *
 * Counted against the activities that **exist**, not against the ids the
 * scenario happens to name: a scenario that mentions three deleted activities
 * would otherwise report a total nobody can see on screen. This is what
 * replaced "piloting included / excluded" everywhere it appeared.
 */
export function scenarioActivityCount(snapshot: BudgetSnapshot, preset: ScenarioPreset): ScenarioActivityCount {
  const activities = activitiesOf(snapshot);
  const enabled = activities.filter((activity) => scenarioActivityState(preset, activity.id).enabled).length;
  const total = activities.length;
  return {
    enabled,
    total,
    label: `${enabled} of ${total} ${total === 1 ? "activity" : "activities"} enabled`,
  };
}

export interface ScenarioActivityLine {
  activity: Activity;
  enabled: boolean;
  /** Funding inside the scenario, which may differ from the activity's own. */
  funding: FundingKind;
  /** True when the scenario overrides the activity's own funding. */
  overridden: boolean;
  /** Monthly cost in the display currency, whoever pays. */
  monthlyBase: number;
  yearlyBase: number;
  /** What this line contributes to the scenario's personal budget. */
  personalMonthlyBase: number;
}

export interface ScenarioProjection {
  lines: ScenarioActivityLine[];
  count: ScenarioActivityCount;
  /** Monthly cost of everything enabled, whoever pays for it. */
  grossMonthly: number;
  /** Monthly cost the scenario charges to the personal budget. */
  personalMonthly: number;
  /** Enabled and paid by somebody else. */
  otherFundedMonthly: number;
  /** Enabled and deliberately outside the budget. */
  outsideBudgetMonthly: number;
  /** Monthly cost of everything the scenario switches off. */
  disabledMonthly: number;
  /** The scenario's budget, or the current one when it does not set one. */
  monthlyBudget: number;
  /** Budget minus the personal commitment. Negative means it does not fit. */
  headroom: number;
}

/**
 * What a scenario actually costs, line by line.
 *
 * The four rules the specification asks for, in one place:
 *  - enabled + paid by me      → contributes to the personal budget;
 *  - enabled + paid by other   → visible, contributes nothing to it;
 *  - enabled + outside budget  → visible, contributes nothing to it;
 *  - disabled                  → contributes nothing at all.
 */
export function scenarioProjection(snapshot: BudgetSnapshot, preset: ScenarioPreset): ScenarioProjection {
  const lines: ScenarioActivityLine[] = activitiesOf(snapshot).map((activity) => {
    const state = scenarioActivityState(preset, activity.id);
    const estimate = estimateActivity(activity, snapshot);
    const own = activityFundingKind(activity);
    const funding = state.funding ?? own;
    return {
      activity,
      enabled: state.enabled,
      funding,
      overridden: state.funding != null && state.funding !== own,
      monthlyBase: estimate.monthlyBase,
      yearlyBase: estimate.yearlyBase,
      personalMonthlyBase: state.enabled && funding === "personal" ? estimate.monthlyBase : 0,
    };
  });

  const enabledLines = lines.filter((line) => line.enabled);
  const monthlyFor = (kind: FundingKind) =>
    enabledLines.filter((line) => line.funding === kind).reduce((total, line) => total + line.monthlyBase, 0);

  const personalMonthly = monthlyFor("personal");
  const monthlyBudget = preset.monthlyBudget ?? snapshot.settings.monthlyBudget ?? 0;

  return {
    lines,
    count: scenarioActivityCount(snapshot, preset),
    grossMonthly: enabledLines.reduce((total, line) => total + line.monthlyBase, 0),
    personalMonthly,
    otherFundedMonthly: monthlyFor("other"),
    outsideBudgetMonthly: monthlyFor("outside"),
    disabledMonthly: lines.filter((line) => !line.enabled).reduce((total, line) => total + line.monthlyBase, 0),
    monthlyBudget,
    headroom: monthlyBudget - personalMonthly,
  };
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

  /*
   * Per-activity changes.
   *
   * Only against activities that exist: a state naming a deleted activity
   * cannot be applied, and listing it would promise a change that cannot
   * happen. An entry that restates the activity's current state is not a
   * change either — the same rule the caps follow.
   */
  for (const activity of activitiesOf(snapshot)) {
    const stored = preset.activityStates?.[activity.id];
    if (!stored) continue;
    const enabled = stored.enabled !== false;
    if (enabled !== activity.active) {
      changes.push({
        kind: "activity-enabled",
        label: activity.name,
        before: activity.active,
        after: enabled,
        activityId: activity.id,
      });
    }
    const own = activityFundingKind(activity);
    if (stored.funding != null && stored.funding !== own) {
      changes.push({
        kind: "activity-funding",
        label: activity.name,
        before: FUNDING_META[own].shortLabel,
        after: FUNDING_META[stored.funding].shortLabel,
        activityId: activity.id,
      });
    }
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
 * a set of caps or re-tick a list of activities.
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

  const activityStates: Record<string, ScenarioActivityState> = {};
  for (const activity of activitiesOf(snapshot)) {
    activityStates[activity.id] = { enabled: activity.active, funding: activityFundingKind(activity) };
  }

  return {
    id,
    name,
    monthlyBudget: snapshot.settings.monthlyBudget,
    // Omitted rather than stored empty, so "no caps" and "caps that happen to
    // be empty" stay distinguishable.
    categoryCaps: Object.keys(categoryCaps).length > 0 ? categoryCaps : undefined,
    activityStates: Object.keys(activityStates).length > 0 ? activityStates : undefined,
    notes: "",
  };
}

/** The selected year's activities, in their listed order. */
function activitiesOf(snapshot: BudgetSnapshot): Activity[] {
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  return (record?.activities ?? []).slice().sort((a, b) => a.order - b.order);
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
