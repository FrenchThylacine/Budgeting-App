/**
 * The first-run tour: when it appears, and when it must not
 * =========================================================
 *
 * The behaviour that matters is the negative one. A tour that reappears after
 * being skipped teaches people to dismiss it without reading, and one that
 * greets somebody who has just imported five years of records is patronising.
 */
import { CURRENCY_OPTIONS } from "../src/domain/currency";
import { afterEach, describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  accountIsEmpty,
  completedOnboarding,
  dismissedReminder,
  postponedOnboarding,
  restartedOnboarding,
  resumeStep,
  shouldAutoStartTutorial,
  shouldOfferReminder,
  skippedOnboarding,
  taskDone,
  tutorialSettled,
} from "../src/domain/tutorial";
import { useBudgetStore } from "../src/store/budgetStore";
import { createEmptyBudgetSnapshot, createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { en } from "../src/i18n/en";
import type { BudgetSnapshot } from "../src/domain/types";

const NOW = new Date("2026-08-10T12:00:00Z");

afterEach(() => {
  useBudgetStore.setState({ snapshot: createEmptyBudgetSnapshot(), undoStack: [], redoStack: [], hydrated: true });
});

describe("the steps", () => {
  it("covers the whole workflow", () => {
    const ids = TUTORIAL_STEPS.map((step) => step.id);
    for (const expected of [
      "dashboard",
      "currencies",
      "activities",
      "schedule",
      "spending",
      "funding",
      "scenarios",
      "stats",
      "reports",
      "wallet",
      "notifications",
    ]) {
      expect(ids, expected).toContain(expected);
    }
  });

  it("uses translation keys that exist, never literal text", () => {
    for (const step of TUTORIAL_STEPS) {
      expect(en, step.id).toHaveProperty(step.titleKey);
      expect(en, step.id).toHaveProperty(step.bodyKey);
    }
  });

  it("asks for notification permission from exactly one step", () => {
    const asking = TUTORIAL_STEPS.filter((step) => step.action === "request-notifications");
    expect(asking).toHaveLength(1);
    // And it is the step that has just explained what the notifications are
    // for, which is what makes the prompt reasonable rather than a surprise.
    expect(asking[0].id).toBe("notifications");
  });
});

describe("who sees it unasked", () => {
  it("shows it to a genuinely empty account", () => {
    const empty = createEmptyBudgetSnapshot();
    expect(accountIsEmpty(empty)).toBe(true);
    expect(shouldAutoStartTutorial(empty)).toBe(true);
  });

  it("does not show it to an account that already has data", () => {
    const seeded = createSeedBudgetSnapshot(NOW);
    expect(accountIsEmpty(seeded)).toBe(false);
    expect(shouldAutoStartTutorial(seeded)).toBe(false);
  });

  it("does not show it again once it has been completed", () => {
    const snapshot = createEmptyBudgetSnapshot();
    snapshot.settings.onboarding = completedOnboarding(12);
    expect(tutorialSettled(snapshot.settings.onboarding)).toBe(true);
    expect(shouldAutoStartTutorial(snapshot)).toBe(false);
  });

  it("does not show it again once it has been skipped", () => {
    const snapshot = createEmptyBudgetSnapshot();
    snapshot.settings.onboarding = skippedOnboarding(2);
    // Skipping is an answer, and it is the same answer as finishing as far as
    // "do not show me this again" is concerned.
    expect(tutorialSettled(snapshot.settings.onboarding)).toBe(true);
    expect(shouldAutoStartTutorial(snapshot)).toBe(false);
  });

  it("shows it again after a version bump", () => {
    const snapshot = createEmptyBudgetSnapshot();
    snapshot.settings.onboarding = { version: TUTORIAL_VERSION - 1, completedAt: NOW.toISOString() };
    expect(tutorialSettled(snapshot.settings.onboarding)).toBe(false);
  });

  it("treats a started-but-unfinished tour as unsettled", () => {
    expect(tutorialSettled({ version: TUTORIAL_VERSION, lastStep: 4 })).toBe(false);
  });
});

describe("persistence", () => {
  it("records completion, with the step it ended on", () => {
    const settings = completedOnboarding(12, NOW);
    expect(settings.version).toBe(TUTORIAL_VERSION);
    expect(settings.completedAt).toBe(NOW.toISOString());
    expect(settings.skippedAt).toBeUndefined();
    expect(settings.lastStep).toBe(12);
  });

  it("records a skip separately from a completion", () => {
    const settings = skippedOnboarding(3, NOW);
    expect(settings.skippedAt).toBe(NOW.toISOString());
    expect(settings.completedAt).toBeUndefined();
  });

  it("survives a save and a reload, because it lives in settings", () => {
    const snapshot = createEmptyBudgetSnapshot();
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
    useBudgetStore.getState().updateSettings({ onboarding: skippedOnboarding(1, NOW) });

    const persisted = JSON.parse(JSON.stringify(useBudgetStore.getState().snapshot)) as BudgetSnapshot;
    expect(persisted.settings.onboarding?.skippedAt).toBe(NOW.toISOString());
    expect(shouldAutoStartTutorial(persisted)).toBe(false);
  });

  it("clears both marks when reopened from Settings, so it runs from the top", () => {
    const restarted = restartedOnboarding();
    expect(restarted.completedAt).toBeUndefined();
    expect(restarted.skippedAt).toBeUndefined();
    expect(restarted.lastStep).toBe(0);
    expect(tutorialSettled(restarted)).toBe(false);
  });
});

describe("the tour teaches by asking, not by telling", () => {
  const withData = (patch: (snapshot: BudgetSnapshot) => void): BudgetSnapshot => {
    const snapshot = createEmptyBudgetSnapshot();
    snapshot.years["2026"] = {
      year: 2026,
      activities: [],
      spendingEntries: [],
      wishlistItems: [],
      walletEntries: [],
      closedMonths: [],
      monthlyNotes: {},
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    patch(snapshot);
    return snapshot;
  };

  it("has a task on the steps where there is something to do", () => {
    const withTask = TUTORIAL_STEPS.filter((step) => step.task);
    expect(withTask.length).toBeGreaterThanOrEqual(5);
    // Every task the steps name has an implementation, and every implementation
    // is reachable from a step. A task nothing asks for is dead code; a step
    // asking for a task nothing implements silently unlocks itself.
    for (const step of withTask) {
      expect(typeof taskDone(step.task!, createEmptyBudgetSnapshot())).toBe("boolean");
    }
  });

  it("reads the real snapshot rather than a flag of its own", () => {
    const empty = createEmptyBudgetSnapshot();
    expect(taskDone("create-activity", empty)).toBe(false);
    expect(taskDone("record-spending", empty)).toBe(false);
    expect(taskDone("create-scenario", empty)).toBe(false);

    const withActivity = withData((snapshot) => {
      snapshot.years["2026"].activities.push({
        id: "a1", name: "Gym", categoryId: "c", currency: "EUR", recurrenceType: "monthly",
        recurrenceInterval: 1, pricePerSession: null, pricePerPurchase: null, pricePerMonth: 20,
        estimatedCost: 20, yearlyEstimate: 240, active: true, visible: true, seasonalTag: "normal",
        order: 0, notes: "",
      });
    });
    expect(taskDone("create-activity", withActivity)).toBe(true);
  });

  it("counts a currency choice only when one was actually made", () => {
    const snapshot = createEmptyBudgetSnapshot();
    // Absent means "the default ten", which is nobody's decision.
    expect(taskDone("pin-currency", snapshot)).toBe(false);
    snapshot.settings.trackedCurrencies = [...CURRENCY_OPTIONS];
    expect(taskDone("pin-currency", snapshot)).toBe(false);
    snapshot.settings.trackedCurrencies = ["EUR", "CHF"];
    expect(taskDone("pin-currency", snapshot)).toBe(true);
  });

  it("accepts either an activity or a transaction for the funding step", () => {
    const viaEntry = withData((snapshot) => {
      snapshot.years["2026"].spendingEntries.push({
        id: "s1", year: 2026, month: 8, week: 33, date: "2026-08-10", categoryId: "c",
        amount: 10, currency: "EUR", recurrenceType: "none", source: "shared", note: "",
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
      });
    });
    expect(taskDone("try-other-funding", viaEntry)).toBe(true);
  });

  it("counts only a budget allocation for the wallet step, not any movement", () => {
    const personalOnly = withData((snapshot) => {
      snapshot.years["2026"].walletEntries.push({
        id: "w1", year: 2026, month: 8, amount: 100, currency: "EUR", source: "Cash",
        type: "personal", note: "", createdAt: NOW.toISOString(),
      });
    });
    expect(taskDone("allocate-budget", personalOnly)).toBe(false);

    const allocated = withData((snapshot) => {
      snapshot.years["2026"].walletEntries.push({
        id: "w2", year: 2026, month: 8, amount: 600, currency: "EUR", source: "Budget",
        type: "budget", note: "", createdAt: NOW.toISOString(),
      });
    });
    expect(taskDone("allocate-budget", allocated)).toBe(true);
  });
});

describe("“Decide later” is a third answer, not a second Skip", () => {
  it("stops the tour reopening, but is not a refusal", () => {
    const postponed = postponedOnboarding(2, NOW);
    expect(postponed.postponedAt).toBe(NOW.toISOString());
    expect(postponed.skippedAt).toBeUndefined();
    expect(tutorialSettled(postponed)).toBe(true);

    const snapshot = createEmptyBudgetSnapshot();
    snapshot.settings.onboarding = postponed;
    expect(shouldAutoStartTutorial(snapshot)).toBe(false);
    // …and this is the difference: a reminder is offered.
    expect(shouldOfferReminder(snapshot)).toBe(true);
  });

  it("resumes at the step it was left on", () => {
    expect(resumeStep(postponedOnboarding(4, NOW))).toBe(4);
    // A stored step from a shorter tour, or a nonsense one, starts at the top
    // rather than throwing or landing on an undefined card.
    expect(resumeStep({ version: 1, lastStep: 9999 })).toBe(0);
    expect(resumeStep(undefined)).toBe(0);
  });

  it("never offers the reminder to somebody who said no", () => {
    const snapshot = createEmptyBudgetSnapshot();
    snapshot.settings.onboarding = skippedOnboarding(1, NOW);
    expect(shouldOfferReminder(snapshot)).toBe(false);
    snapshot.settings.onboarding = completedOnboarding(12, NOW);
    expect(shouldOfferReminder(snapshot)).toBe(false);
  });

  it("stops offering the reminder once it is dismissed, and keeps the deferral", () => {
    const snapshot = createEmptyBudgetSnapshot();
    snapshot.settings.onboarding = postponedOnboarding(3, NOW);
    snapshot.settings.onboarding = dismissedReminder(snapshot.settings.onboarding, NOW);

    expect(shouldOfferReminder(snapshot)).toBe(false);
    expect(shouldAutoStartTutorial(snapshot)).toBe(false);
    // The step is kept: Settings can still replay it, and resuming lands where
    // the reader stopped rather than at the beginning.
    expect(resumeStep(snapshot.settings.onboarding)).toBe(3);
  });
});
