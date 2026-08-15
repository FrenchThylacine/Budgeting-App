import { afterEach, describe, expect, it } from "vitest";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { useBudgetStore } from "../src/store/budgetStore";

const NOW = new Date("2026-08-10T12:00:00Z");

function setSnapshot(snapshot = createSeedBudgetSnapshot(NOW)) {
  useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [], historicalEditUnlocked: false });
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

describe("transaction editing preserves data", () => {
  it("keeps recurrenceType when other fields are edited", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 8;
    snapshot.years["2026"].spendingEntries.push({
      id: "spend-recurring",
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-10",
      categoryId: "cat-spending",
      amount: 40,
      currency: "EUR",
      recurrenceType: "monthly",
      isPiloting: false,
      note: "gym",
      createdAt: "2026-08-10T00:00:00Z",
      updatedAt: "2026-08-10T00:00:00Z",
    });
    useBudgetStore.setState({ snapshot });

    // Editing the amount alone must not reset the recurrence.
    useBudgetStore.getState().updateSpendingEntry("spend-recurring", { amount: 45 });

    const entry = useBudgetStore
      .getState()
      .snapshot.years["2026"].spendingEntries.find((e) => e.id === "spend-recurring")!;
    expect(entry.amount).toBe(45);
    expect(entry.recurrenceType).toBe("monthly");
  });

  it("re-homes an entry into the matching year record when its date year changes", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 8;
    snapshot.years["2026"].spendingEntries.push({
      id: "spend-move",
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-10",
      categoryId: "cat-spending",
      amount: 10,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "",
      createdAt: "2026-08-10T00:00:00Z",
      updatedAt: "2026-08-10T00:00:00Z",
    });
    useBudgetStore.setState({ snapshot });

    useBudgetStore.getState().updateSpendingEntry("spend-move", { date: "2027-01-05" });

    const state = useBudgetStore.getState().snapshot;
    expect(state.years["2026"].spendingEntries.find((e) => e.id === "spend-move")).toBeUndefined();
    const moved = state.years["2027"].spendingEntries.find((e) => e.id === "spend-move")!;
    expect(moved.year).toBe(2027);
    expect(moved.month).toBe(1);
    expect(moved.week).toBe(1);
  });
});

describe("category edits and historical integrity", () => {
  it("blocks bucket and cap changes while a historical period is selected", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7; // historical relative to NOW (August)
    const category = snapshot.categories.find((c) => c.id === "cat-spending")!;
    const originalBucket = category.bucket;
    useBudgetStore.setState({ snapshot });

    useBudgetStore.getState().updateCategory("cat-spending", {
      name: "Renamed while historical",
      bucket: "piloting",
      monthlyCap: 999,
    });

    const updated = useBudgetStore.getState().snapshot.categories.find((c) => c.id === "cat-spending")!;
    // Harmless metadata still applies...
    expect(updated.name).toBe("Renamed while historical");
    // ...but fields that would rewrite historical reporting do not.
    expect(updated.bucket).toBe(originalBucket);
    expect(updated.monthlyCap).not.toBe(999);
  });

  it("allows bucket changes for the current period", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 8;
    useBudgetStore.setState({ snapshot });

    useBudgetStore.getState().updateCategory("cat-spending", { bucket: "piloting" });

    expect(
      useBudgetStore.getState().snapshot.categories.find((c) => c.id === "cat-spending")!.bucket,
    ).toBe("piloting");
  });

  it("refuses a parent assignment that would create a cycle", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedMonth = 8;
    snapshot.categories.push(
      { id: "cat-parent", name: "Parent", bucket: "general", color: "#111111" },
      { id: "cat-child", name: "Child", bucket: "general", color: "#222222", parentId: "cat-parent" },
    );
    useBudgetStore.setState({ snapshot });

    // Making the parent a child of its own child must be rejected.
    useBudgetStore.getState().updateCategory("cat-parent", { parentId: "cat-child" });
    expect(useBudgetStore.getState().snapshot.categories.find((c) => c.id === "cat-parent")!.parentId).toBeUndefined();

    // Self-parenting is likewise rejected.
    useBudgetStore.getState().updateCategory("cat-child", { parentId: "cat-child" });
    expect(useBudgetStore.getState().snapshot.categories.find((c) => c.id === "cat-child")!.parentId).toBe("cat-parent");
  });
});

describe("historical editing override", () => {
  it("blocks period-bound writes while a closed period is locked", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7; // historical relative to NOW (August)
    useBudgetStore.setState({ snapshot, historicalEditUnlocked: false });

    expect(useBudgetStore.getState().isCurrentPeriodMutable()).toBe(false);
    expect(useBudgetStore.getState().isEditingHistory()).toBe(false);
  });

  it("allows period-bound writes once explicitly unlocked", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7;
    useBudgetStore.setState({ snapshot });
    const before = useBudgetStore.getState().snapshot.years["2026"].spendingEntries.length;

    useBudgetStore.getState().unlockHistoricalEditing();
    expect(useBudgetStore.getState().isCurrentPeriodMutable()).toBe(true);
    expect(useBudgetStore.getState().isEditingHistory()).toBe(true);

    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 7,
      week: 30,
      date: "2026-07-20",
      categoryId: "cat-spending",
      amount: 33,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "Late receipt",
    });

    expect(useBudgetStore.getState().snapshot.years["2026"].spendingEntries).toHaveLength(before + 1);
  });

  it("flags a historical change in the audit trail with its period", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7;
    useBudgetStore.setState({ snapshot, historicalEditUnlocked: true });

    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 7,
      week: 30,
      date: "2026-07-20",
      categoryId: "cat-spending",
      amount: 10,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "",
    });

    const latest = useBudgetStore.getState().snapshot.auditLog[0];
    expect(latest.historicalEdit).toBe(true);
    expect(latest.historicalPeriod).toBe("July 2026");
    expect(latest.summary).toContain("historical edit");
  });

  it("does not flag ordinary current-period changes", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 8; // current
    useBudgetStore.setState({ snapshot, historicalEditUnlocked: true });

    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-12",
      categoryId: "cat-spending",
      amount: 10,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      note: "",
    });

    const latest = useBudgetStore.getState().snapshot.auditLog[0];
    expect(latest.historicalEdit).toBe(false);
    expect(latest.summary).not.toContain("historical edit");
  });

  it("relocks automatically when the selected period changes", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7;
    useBudgetStore.setState({ snapshot, historicalEditUnlocked: true });

    useBudgetStore.getState().updateSettings({ selectedMonth: 6 });

    expect(useBudgetStore.getState().historicalEditUnlocked).toBe(false);
    expect(useBudgetStore.getState().isCurrentPeriodMutable()).toBe(false);
  });

  it("does not relock for a non-period setting change", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedMonth = 7;
    useBudgetStore.setState({ snapshot, historicalEditUnlocked: true });

    useBudgetStore.getState().updateSettings({ darkMode: true });

    expect(useBudgetStore.getState().historicalEditUnlocked).toBe(true);
  });

  it("keeps approved budgets immutable even while history is unlocked", () => {
    const snapshot = setSnapshot();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 7;
    useBudgetStore.setState({ snapshot, historicalEditUnlocked: true });
    const before = useBudgetStore.getState().snapshot.budgetApprovals.length;

    // The override unlocks data, never decision records.
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
