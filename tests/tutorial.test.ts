/**
 * The first-run tour: when it appears, and when it must not
 * =========================================================
 *
 * The behaviour that matters is the negative one. A tour that reappears after
 * being skipped teaches people to dismiss it without reading, and one that
 * greets somebody who has just imported five years of records is patronising.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  accountIsEmpty,
  completedOnboarding,
  restartedOnboarding,
  shouldAutoStartTutorial,
  skippedOnboarding,
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
