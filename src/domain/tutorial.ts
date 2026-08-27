/**
 * The first-run tour
 * ==================
 *
 * A dozen short cards, each pointing at the tab it describes, rather than one
 * wall of text nobody reads. The steps are data so the component is a
 * renderer: adding a step is a row here, and every string goes through the
 * translation layer like the rest of the interface.
 *
 * When it appears is a decision with only one defensible answer: a *genuinely*
 * new account — one that has never completed it, never skipped it, and has no
 * data of its own. An account restored from a backup is not new, and being
 * walked through the basics after importing five years of records is
 * patronising.
 */
import type { BudgetSnapshot, OnboardingSettings } from "./types";

/**
 * Bumping this offers the tour again to everyone.
 *
 * Deliberately not bumped for wording changes: an interface that re-introduces
 * itself after every release teaches people to dismiss it without reading.
 */
export const TUTORIAL_VERSION = 1;

export type TutorialTab =
  | "dashboard"
  | "currencies"
  | "activities"
  | "spending"
  | "scenarios"
  | "analytics"
  | "wallet"
  | "settings";

export interface TutorialStep {
  id: string;
  /** Translation keys, never literal text. */
  titleKey: string;
  bodyKey: string;
  /**
   * The tab this step is about.
   *
   * The tour switches to it as the step opens, so the card is explaining
   * something the user can see rather than something they have to imagine.
   */
  tab?: TutorialTab;
  /**
   * A step that asks the browser for something.
   *
   * Only the notification step sets this, and it is what puts the permission
   * request behind an explanation and a user gesture.
   */
  action?: "request-notifications";
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: "welcome", titleKey: "tutorial.welcomeTitle", bodyKey: "tutorial.welcomeBody" },
  { id: "dashboard", titleKey: "tutorial.dashboardTitle", bodyKey: "tutorial.dashboardBody", tab: "dashboard" },
  { id: "currencies", titleKey: "tutorial.currenciesTitle", bodyKey: "tutorial.currenciesBody", tab: "currencies" },
  { id: "activities", titleKey: "tutorial.activitiesTitle", bodyKey: "tutorial.activitiesBody", tab: "activities" },
  { id: "schedule", titleKey: "tutorial.scheduleTitle", bodyKey: "tutorial.scheduleBody", tab: "activities" },
  { id: "spending", titleKey: "tutorial.spendingTitle", bodyKey: "tutorial.spendingBody", tab: "spending" },
  { id: "funding", titleKey: "tutorial.fundingTitle", bodyKey: "tutorial.fundingBody", tab: "spending" },
  { id: "scenarios", titleKey: "tutorial.scenariosTitle", bodyKey: "tutorial.scenariosBody", tab: "scenarios" },
  { id: "stats", titleKey: "tutorial.statsTitle", bodyKey: "tutorial.statsBody", tab: "analytics" },
  { id: "reports", titleKey: "tutorial.reportsTitle", bodyKey: "tutorial.reportsBody" },
  { id: "wallet", titleKey: "tutorial.walletTitle", bodyKey: "tutorial.walletBody", tab: "wallet" },
  {
    id: "notifications",
    titleKey: "tutorial.notificationsTitle",
    bodyKey: "tutorial.notificationsBody",
    tab: "settings",
    action: "request-notifications",
  },
  { id: "done", titleKey: "tutorial.doneTitle", bodyKey: "tutorial.doneBody" },
];

/** True when the tour has been seen to the end, or deliberately dismissed. */
export function tutorialSettled(onboarding: OnboardingSettings | undefined): boolean {
  if (!onboarding) return false;
  if (onboarding.version !== TUTORIAL_VERSION) return false;
  return Boolean(onboarding.completedAt || onboarding.skippedAt);
}

/**
 * Whether this account has anything of its own in it.
 *
 * An imported budget is not a new user, and neither is one that already has a
 * single activity. Only an account with no records at all gets the tour
 * unasked; everyone else can start it from Settings.
 */
export function accountIsEmpty(snapshot: BudgetSnapshot): boolean {
  return Object.values(snapshot.years).every(
    (year) =>
      (year?.activities?.length ?? 0) === 0 &&
      (year?.spendingEntries?.length ?? 0) === 0 &&
      (year?.wishlistItems?.length ?? 0) === 0 &&
      (year?.walletEntries?.length ?? 0) === 0,
  );
}

/** Should the tour open by itself right now? */
export function shouldAutoStartTutorial(snapshot: BudgetSnapshot): boolean {
  return !tutorialSettled(snapshot.settings.onboarding) && accountIsEmpty(snapshot);
}

export function completedOnboarding(step: number, now = new Date()): OnboardingSettings {
  return { version: TUTORIAL_VERSION, completedAt: now.toISOString(), lastStep: step };
}

export function skippedOnboarding(step: number, now = new Date()): OnboardingSettings {
  return { version: TUTORIAL_VERSION, skippedAt: now.toISOString(), lastStep: step };
}

/** Reopening from Settings clears both marks so the tour runs from the top. */
export function restartedOnboarding(): OnboardingSettings {
  return { version: TUTORIAL_VERSION, lastStep: 0 };
}
