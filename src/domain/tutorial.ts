/**
 * The first-run tour
 * ==================
 *
 * A dozen short cards, each pointing at the tab it describes — and, for the
 * six that matter, **each waiting for the reader to actually do the thing**.
 *
 * A tour that advances on Next teaches nothing: it is a slideshow with the
 * application as a backdrop, and at the end the reader has read twelve
 * paragraphs and performed zero actions. The steps below carry a `task`: a
 * predicate over the real snapshot that says whether the thing has been done.
 * Until it has, Next is unavailable — and "Skip this step" is right beside it,
 * because a tutorial that traps somebody is worse than one that teaches
 * nothing.
 *
 * The steps are data so the component is a renderer: adding a step is a row
 * here, and every string goes through the translation layer like the rest of
 * the interface.
 *
 * When it appears is a decision with only one defensible answer: a *genuinely*
 * new account — one that has never completed it, never skipped it, never put it
 * off, and has no data of its own. An account restored from a backup is not
 * new, and being walked through the basics after importing five years of
 * records is patronising.
 */
import { CURRENCY_OPTIONS } from "./currency";
import { activityFundingKind, entryFundingKind } from "./funding";
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
  | "activities"
  | "spending"
  | "scenarios"
  | "analytics"
  | "wallet"
  | "settings";

/** Something the reader is asked to do before the step is complete. */
export type TutorialTaskId =
  | "pin-currency"
  | "create-activity"
  | "record-spending"
  | "try-other-funding"
  | "allocate-budget"
  | "create-scenario";

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
   * What the reader is asked to do here.
   *
   * `taskDone` below answers whether they have. The card states the task, the
   * card reports the moment it is satisfied, and Next unlocks — so the tour
   * teaches by having the reader use the application rather than by describing
   * it to them.
   */
  task?: TutorialTaskId;
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
  {
    id: "currencies",
    titleKey: "tutorial.currenciesTitle",
    bodyKey: "tutorial.currenciesBody",
    // Currencies moved into Settings; the tour follows it there.
    tab: "settings",
    task: "pin-currency",
  },
  {
    id: "activities",
    titleKey: "tutorial.activitiesTitle",
    bodyKey: "tutorial.activitiesBody",
    tab: "activities",
    task: "create-activity",
  },
  { id: "schedule", titleKey: "tutorial.scheduleTitle", bodyKey: "tutorial.scheduleBody", tab: "activities" },
  {
    id: "spending",
    titleKey: "tutorial.spendingTitle",
    bodyKey: "tutorial.spendingBody",
    tab: "spending",
    task: "record-spending",
  },
  {
    id: "funding",
    titleKey: "tutorial.fundingTitle",
    bodyKey: "tutorial.fundingBody",
    tab: "spending",
    task: "try-other-funding",
  },
  {
    id: "wallet",
    titleKey: "tutorial.walletTitle",
    bodyKey: "tutorial.walletBody",
    tab: "wallet",
    task: "allocate-budget",
  },
  {
    id: "scenarios",
    titleKey: "tutorial.scenariosTitle",
    bodyKey: "tutorial.scenariosBody",
    tab: "scenarios",
    task: "create-scenario",
  },
  { id: "stats", titleKey: "tutorial.statsTitle", bodyKey: "tutorial.statsBody", tab: "analytics" },
  { id: "reports", titleKey: "tutorial.reportsTitle", bodyKey: "tutorial.reportsBody" },
  {
    id: "notifications",
    titleKey: "tutorial.notificationsTitle",
    bodyKey: "tutorial.notificationsBody",
    tab: "settings",
    action: "request-notifications",
  },
  { id: "done", titleKey: "tutorial.doneTitle", bodyKey: "tutorial.doneBody" },
];

const years = (snapshot: BudgetSnapshot) => Object.values(snapshot.years);

/**
 * Has the reader done what this step asked?
 *
 * Read from the real snapshot, never from a flag the tour sets itself: the
 * point of the task is that the application genuinely contains the thing. A
 * tour that ticks its own box is a slideshow with extra steps.
 */
export function taskDone(task: TutorialTaskId, snapshot: BudgetSnapshot): boolean {
  switch (task) {
    case "pin-currency": {
      const pinned = snapshot.settings.trackedCurrencies;
      // Absent means "the default ten", which is not a choice anybody made.
      // Any explicit list counts, including one that narrows the defaults.
      if (!Array.isArray(pinned) || pinned.length === 0) return false;
      const defaults = new Set<string>(CURRENCY_OPTIONS);
      return pinned.length !== defaults.size || pinned.some((code) => !defaults.has(code));
    }
    case "create-activity":
      return years(snapshot).some((year) => (year?.activities?.length ?? 0) > 0);
    case "record-spending":
      return years(snapshot).some((year) => (year?.spendingEntries?.length ?? 0) > 0);
    case "try-other-funding":
      return years(snapshot).some(
        (year) =>
          (year?.spendingEntries ?? []).some((entry) => entryFundingKind(entry) !== "personal") ||
          (year?.activities ?? []).some((activity) => activityFundingKind(activity) !== "personal"),
      );
    case "allocate-budget":
      return years(snapshot).some((year) => (year?.walletEntries ?? []).some((entry) => entry.type === "budget"));
    case "create-scenario":
      return (snapshot.scenarioPresets?.length ?? 0) > 0;
    default:
      return true;
  }
}

/**
 * True when the tour has been dealt with: finished, dismissed, or put off.
 *
 * "Decide later" belongs here. Reopening the tour every time somebody says
 * "not now" is precisely the behaviour the option exists to prevent; the
 * reminder below is how it comes back, once, quietly.
 */
export function tutorialSettled(onboarding: OnboardingSettings | undefined): boolean {
  if (!onboarding) return false;
  if (onboarding.version !== TUTORIAL_VERSION) return false;
  return Boolean(onboarding.completedAt || onboarding.skippedAt || onboarding.postponedAt);
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

/**
 * Should the quiet reminder be offered?
 *
 * Only for somebody who said "later" — not for somebody who said no. Once they
 * dismiss the reminder it never returns on its own; Settings still has the
 * button, which is the difference between an offer and nagging.
 */
export function shouldOfferReminder(snapshot: BudgetSnapshot): boolean {
  const onboarding = snapshot.settings.onboarding;
  if (!onboarding || onboarding.version !== TUTORIAL_VERSION) return false;
  if (onboarding.completedAt || onboarding.skippedAt) return false;
  return Boolean(onboarding.postponedAt) && !onboarding.reminderDismissedAt;
}

export function completedOnboarding(step: number, now = new Date()): OnboardingSettings {
  return { version: TUTORIAL_VERSION, completedAt: now.toISOString(), lastStep: step };
}

export function skippedOnboarding(step: number, now = new Date()): OnboardingSettings {
  return { version: TUTORIAL_VERSION, skippedAt: now.toISOString(), lastStep: step };
}

/**
 * "Decide later": remembered, and resumable from where it was left.
 *
 * Distinct from Skip on purpose. Skip is "no"; this is "not now", and the two
 * deserve different behaviour — one ends the offer, the other defers it.
 */
export function postponedOnboarding(step: number, now = new Date()): OnboardingSettings {
  return { version: TUTORIAL_VERSION, postponedAt: now.toISOString(), lastStep: step };
}

/** The reminder was dismissed. The tour stays available from Settings. */
export function dismissedReminder(onboarding: OnboardingSettings | undefined, now = new Date()): OnboardingSettings {
  return {
    version: TUTORIAL_VERSION,
    lastStep: onboarding?.lastStep ?? 0,
    postponedAt: onboarding?.postponedAt ?? now.toISOString(),
    reminderDismissedAt: now.toISOString(),
  };
}

/** Reopening from Settings clears every mark so the tour runs from the top. */
export function restartedOnboarding(): OnboardingSettings {
  return { version: TUTORIAL_VERSION, lastStep: 0 };
}

/** Resuming from the reminder keeps the step it was left on. */
export function resumeStep(onboarding: OnboardingSettings | undefined): number {
  const step = onboarding?.lastStep ?? 0;
  return Number.isInteger(step) && step >= 0 && step < TUTORIAL_STEPS.length ? step : 0;
}
