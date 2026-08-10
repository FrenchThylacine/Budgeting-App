import { afterEach, describe, expect, it } from "vitest";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { useBudgetStore } from "../src/store/budgetStore";

const NOW = new Date("2026-08-10T12:00:00Z");

function setSnapshot(snapshot = createSeedBudgetSnapshot(NOW)) {
  useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
  return snapshot;
}

afterEach(() => {
  setSnapshot();
});

describe("historical store guards", () => {
  it("does not add period-bound spending while a previous ISO week is selected", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "week";
    snapshot.settings.selectedWeekYear = 2026;
    snapshot.settings.selectedWeek = 31;
    snapshot.settings.selectedYear = 2026;
    const before = snapshot.years["2026"].spendingEntries.length;

    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 8,
      week: 31,
      date: "2026-08-03",
      categoryId: "cat-spending",
      amount: 0,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Must not be written",
    });

    expect(useBudgetStore.getState().snapshot.years["2026"].spendingEntries).toHaveLength(before);
  });

  it("does not create an approval while a historical month is selected", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7;
    const before = snapshot.budgetApprovals.length;

    useBudgetStore.getState().recordBudgetApproval({
      year: 2026,
      month: 7,
      suggestedAmount: 500,
      approvedAmount: 500,
      currency: "EUR",
      status: "approved",
      recurringTotal: 300,
      note: "Must not be written",
    });

    expect(useBudgetStore.getState().snapshot.budgetApprovals).toHaveLength(before);
  });
});
