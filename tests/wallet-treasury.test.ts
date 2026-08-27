/**
 * The wallet as a treasury
 * ========================
 *
 * Two systems that must never be collapsed into one:
 *
 *   the **plan**     — what this month's activities require, rounded up to the
 *                      next hundred. A number the app calculates.
 *   the **treasury** — what money actually exists, from a ledger of real
 *                      movements. A number only the user can assert.
 *
 * The suite below is built around the specification's own worked scenario, and
 * around the failure modes that make a treasury lie: double counting an
 * allocation, letting a calendar month consume money, and treating a transfer
 * between two of your own pockets as cash arriving.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  budgetPeriods,
  ledgerEpoch,
  leftoverBudget,
  monthlyBudgetPlan,
  roundUpToHundred,
  walletState,
} from "../src/domain/wallet";
import { calculateSuggestedMonthlyBudget, calculateYear } from "../src/domain/calculations";
import { useBudgetStore } from "../src/store/budgetStore";
import { createEmptyBudgetSnapshot } from "../src/data/seedBudget";
import { findSeedCategory } from "../src/domain/seedCategories";
import type { Activity, BudgetSnapshot, SpendingEntry, WalletEntry } from "../src/domain/types";

const NOW = new Date(2026, 7, 16);

function emptyYear(year: number) {
  return {
    year,
    activities: [] as Activity[],
    spendingEntries: [] as SpendingEntry[],
    wishlistItems: [],
    walletEntries: [] as WalletEntry[],
    closedMonths: [],
    monthlyNotes: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** A budget with nothing in it, in dollars, viewing August 2026. */
function budget(): BudgetSnapshot {
  const snapshot = createEmptyBudgetSnapshot();
  snapshot.settings.baseCurrency = "USD";
  snapshot.settings.monthlyBudgetCurrency = "USD";
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.selectedPeriodMode = "month";
  snapshot.settings.pilotIncludedInBudget = true;
  snapshot.years["2026"] = emptyYear(2026);
  return snapshot;
}

function allocation(snapshot: BudgetSnapshot, amount: number, date: string, id = `alloc-${date}-${amount}`): void {
  const year = Number(date.slice(0, 4));
  if (!snapshot.years[String(year)]) snapshot.years[String(year)] = emptyYear(year);
  snapshot.years[String(year)].walletEntries.push({
    id,
    year,
    month: Number(date.slice(5, 7)),
    date,
    amount,
    currency: "USD",
    source: "Monthly budget",
    type: "budget",
    note: "",
    createdAt: `${date}T09:00:00.000Z`,
  });
}

function personalMoney(snapshot: BudgetSnapshot, amount: number, date: string, id = `personal-${date}-${amount}`): void {
  const year = Number(date.slice(0, 4));
  if (!snapshot.years[String(year)]) snapshot.years[String(year)] = emptyYear(year);
  snapshot.years[String(year)].walletEntries.push({
    id,
    year,
    month: Number(date.slice(5, 7)),
    date,
    amount,
    currency: "USD",
    source: "My own money",
    type: "personal",
    note: "",
    createdAt: `${date}T09:00:00.000Z`,
  });
}

function spend(
  snapshot: BudgetSnapshot,
  amount: number,
  date: string,
  source: string = "personal",
  id = `spend-${date}-${amount}-${source}`,
): void {
  const year = Number(date.slice(0, 4));
  if (!snapshot.years[String(year)]) snapshot.years[String(year)] = emptyYear(year);
  snapshot.years[String(year)].spendingEntries.push({
    id,
    year,
    month: Number(date.slice(5, 7)),
    week: 1,
    date,
    categoryId: findSeedCategory(snapshot.categories, "cat-spending")!.id,
    amount,
    currency: "USD",
    recurrenceType: "none",
    isPiloting: false,
    source,
    note: `Spent ${amount}`,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
  });
}

function fixedActivity(name: string, monthly: number, overrides: Partial<Activity> = {}): Activity {
  return {
    id: `act-${name}`,
    name,
    categoryId: "cat-x",
    currency: "USD",
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

afterEach(() => {
  useBudgetStore.setState({ snapshot: createEmptyBudgetSnapshot(), undoStack: [], redoStack: [], hydrated: true });
});

describe("an empty wallet", () => {
  it("starts at zero, with no ledger at all", () => {
    const state = walletState(budget());
    expect(state.walletBalance).toBe(0);
    expect(state.budgetRemaining).toBe(0);
    expect(state.personalBalance).toBe(0);
    expect(state.movements).toHaveLength(0);
    expect(ledgerEpoch(budget())).toBeNull();
  });

  it("does not charge years of pre-existing spending against a ledger that has not started", () => {
    // The failure this prevents: a five-year-old budget opening the Wallet tab
    // for the first time and being told it is $40,000 overdrawn.
    const snapshot = budget();
    spend(snapshot, 5000, "2024-03-01");
    spend(snapshot, 3000, "2025-06-01");
    expect(walletState(snapshot).walletBalance).toBe(0);
  });

  it("counts spending only from the day the ledger opens", () => {
    const snapshot = budget();
    spend(snapshot, 500, "2026-07-20"); // before the ledger
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 100, "2026-08-05"); // after it

    const state = walletState(snapshot);
    expect(state.epoch).toBe("2026-08-01");
    expect(state.walletBalance).toBeCloseTo(500, 6);
    expect(state.budgetRemaining).toBeCloseTo(500, 6);
  });
});

describe("money in and money out", () => {
  it("increases the balance on the way in and decreases it on the way out", () => {
    const snapshot = budget();
    personalMoney(snapshot, 250, "2026-08-01");
    expect(walletState(snapshot).walletBalance).toBeCloseTo(250, 6);

    personalMoney(snapshot, -80, "2026-08-03", "withdrawal");
    const state = walletState(snapshot);
    expect(state.walletBalance).toBeCloseTo(170, 6);
    expect(state.moneyIn).toBeCloseTo(250, 6);
    expect(state.moneyOut).toBeCloseTo(80, 6);
  });

  it("does not let personal money touch the budget", () => {
    const snapshot = budget();
    personalMoney(snapshot, 250, "2026-08-01");
    const state = walletState(snapshot);
    expect(state.budgetRemaining).toBe(0);
    expect(state.personalBalance).toBeCloseTo(250, 6);
  });
});

describe("the specification's worked example: $600 allocated, $100 + $50 + $75 spent", () => {
  const snapshot = budget();
  allocation(snapshot, 600, "2026-08-01");
  spend(snapshot, 100, "2026-08-05");
  spend(snapshot, 50, "2026-08-06");
  spend(snapshot, 75, "2026-08-07");

  it("leaves $375 of budget and $375 in the wallet", () => {
    const state = walletState(snapshot);
    expect(state.allocatedTotal).toBeCloseTo(600, 6);
    expect(state.budgetSpent).toBeCloseTo(225, 6);
    expect(state.budgetRemaining).toBeCloseTo(375, 6);
    expect(state.walletBalance).toBeCloseTo(375, 6);
    expect(state.personalBalance).toBeCloseTo(0, 6);
  });

  it("counts the allocation exactly once", () => {
    // The classic double count: an allocation that is both a ledger entry and
    // an addition to a stored balance.
    expect(walletState(snapshot).movements.filter((movement) => movement.kind === "budget")).toHaveLength(1);
    expect(walletState(snapshot).moneyIn).toBeCloseTo(600, 6);
  });

  it("lists every movement, spending included", () => {
    const state = walletState(snapshot);
    expect(state.movements).toHaveLength(4);
    expect(state.movements.filter((movement) => movement.kind === "spending")).toHaveLength(3);
  });
});

describe("what does and does not consume the budget", () => {
  it("charges paid-by-me spending to the budget and the wallet", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 100, "2026-08-05", "personal");
    const state = walletState(snapshot);
    expect(state.budgetRemaining).toBeCloseTo(500, 6);
    expect(state.walletBalance).toBeCloseTo(500, 6);
  });

  it("charges paid-by-other spending to neither", () => {
    // Somebody else's money never entered this wallet, so it cannot leave it.
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 200, "2026-08-05", "shared");
    const state = walletState(snapshot);
    expect(state.budgetRemaining).toBeCloseTo(600, 6);
    expect(state.walletBalance).toBeCloseTo(600, 6);
  });

  it("charges outside-budget spending to neither", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 150, "2026-08-05", "external");
    const state = walletState(snapshot);
    expect(state.budgetRemaining).toBeCloseTo(600, 6);
    expect(state.walletBalance).toBeCloseTo(600, 6);
  });

  it("keeps both exclusions visible in the spending record regardless", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 200, "2026-08-05", "shared");
    spend(snapshot, 150, "2026-08-06", "external");
    // Not in the wallet, fully present everywhere spending is reported.
    expect(snapshot.years["2026"].spendingEntries).toHaveLength(2);
    expect(calculateYear(snapshot, NOW).otherFundedSpend).toBeCloseTo(200, 6);
    expect(calculateYear(snapshot, NOW).outsideBudgetSpend).toBeCloseTo(150, 6);
  });
});

describe("personal money alongside budget money", () => {
  it("adds up: wallet = budget funds + personal funds", () => {
    // The specification's second example.
    const snapshot = budget();
    personalMoney(snapshot, 250, "2026-08-01");
    allocation(snapshot, 600, "2026-08-02");

    let state = walletState(snapshot);
    expect(state.walletBalance).toBeCloseTo(850, 6);
    expect(state.budgetRemaining).toBeCloseTo(600, 6);
    expect(state.personalBalance).toBeCloseTo(250, 6);

    spend(snapshot, 100, "2026-08-05");
    state = walletState(snapshot);
    expect(state.walletBalance).toBeCloseTo(750, 6);
    expect(state.budgetRemaining).toBeCloseTo(500, 6);
    expect(state.personalBalance).toBeCloseTo(250, 6);
    // The invariant, checked directly.
    expect(state.budgetRemaining + state.personalBalance).toBeCloseTo(state.walletBalance, 6);
  });
});

describe("crossing a month boundary", () => {
  it("does not destroy leftover budget when the month ends", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-01-05");
    spend(snapshot, 450, "2026-01-20");
    // Now look at it from March. Nothing has happened in between.
    snapshot.settings.selectedMonth = 3;
    expect(walletState(snapshot).budgetRemaining).toBeCloseTo(150, 6);
    expect(walletState(snapshot).walletBalance).toBeCloseTo(150, 6);
  });

  it("lets a purchase in the following month be paid from last month's budget", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-01-05");
    spend(snapshot, 450, "2026-01-20");
    spend(snapshot, 120, "2026-02-08");
    expect(walletState(snapshot).budgetRemaining).toBeCloseTo(30, 6);
  });

  it("carries budget funds across a year boundary", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-12-01");
    spend(snapshot, 200, "2026-12-15");
    spend(snapshot, 100, "2027-01-10");
    const state = walletState(snapshot);
    expect(state.budgetRemaining).toBeCloseTo(300, 6);
    expect(state.walletBalance).toBeCloseTo(300, 6);
  });

  it("shows the carry-over in the month-by-month history", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 425, "2026-08-14");
    allocation(snapshot, 600, "2026-09-01");

    const periods = budgetPeriods(snapshot);
    const august = periods.find((period) => period.month === 8)!;
    const september = periods.find((period) => period.month === 9)!;

    expect(august.carriedIn).toBe(0);
    expect(august.allocated).toBeCloseTo(600, 6);
    expect(august.spent).toBeCloseTo(425, 6);
    expect(august.remaining).toBeCloseTo(175, 6);

    // September starts with what August did not spend.
    expect(september.carriedIn).toBeCloseTo(175, 6);
    expect(september.allocated).toBeCloseTo(600, 6);
    expect(september.remaining).toBeCloseTo(775, 6);
  });
});

describe("moving leftover budget to the personal balance", () => {
  it("reduces the budget, raises the personal balance, and leaves the wallet alone", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    personalMoney(snapshot, 200, "2026-08-02");
    spend(snapshot, 450, "2026-08-10");
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });

    const before = walletState(useBudgetStore.getState().snapshot);
    expect(before.budgetRemaining).toBeCloseTo(150, 6);
    expect(before.personalBalance).toBeCloseTo(200, 6);
    expect(before.walletBalance).toBeCloseTo(350, 6);

    useBudgetStore.getState().transferBudgetToPersonal(150);

    const after = walletState(useBudgetStore.getState().snapshot);
    expect(after.budgetRemaining).toBeCloseTo(0, 6);
    expect(after.personalBalance).toBeCloseTo(350, 6);
    // The whole point: moving money between two of your own pockets does not
    // change how much money you have.
    expect(after.walletBalance).toBeCloseTo(350, 6);
  });

  it("offers the prompt only while there is something to prompt about", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 600, "2026-08-10");
    expect(leftoverBudget(snapshot)).toBe(0);

    const withLeftover = budget();
    allocation(withLeftover, 600, "2026-08-01");
    spend(withLeftover, 425, "2026-08-10");
    expect(leftoverBudget(withLeftover)).toBeCloseTo(175, 6);
  });

  it("refuses a transfer of nothing, or of a negative amount", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
    const before = useBudgetStore.getState().snapshot.years["2026"].walletEntries.length;

    useBudgetStore.getState().transferBudgetToPersonal(0);
    useBudgetStore.getState().transferBudgetToPersonal(-50);

    expect(useBudgetStore.getState().snapshot.years["2026"].walletEntries).toHaveLength(before);
  });
});

describe("adding a new allocation on top of carried-over funds", () => {
  it("adds rather than replaces", () => {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    spend(snapshot, 425, "2026-08-14");
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });

    useBudgetStore
      .getState()
      .allocateBudget({ amount: 600, currency: "USD", date: "2026-09-01", note: "September" });

    const state = walletState(useBudgetStore.getState().snapshot);
    expect(state.allocatedTotal).toBeCloseTo(1200, 6);
    expect(state.budgetRemaining).toBeCloseTo(775, 6);
    expect(state.walletBalance).toBeCloseTo(775, 6);
  });

  it("writes exactly one ledger entry per allocation", () => {
    const snapshot = budget();
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
    useBudgetStore.getState().allocateBudget({ amount: 600, currency: "USD", date: "2026-08-01" });
    useBudgetStore.getState().allocateBudget({ amount: 600, currency: "USD", date: "2026-09-01" });
    const entries = Object.values(useBudgetStore.getState().snapshot.years).flatMap((year) => year.walletEntries);
    expect(entries.filter((entry) => entry.type === "budget")).toHaveLength(2);
  });
});

describe("staying in step with the spending record", () => {
  function loaded(): BudgetSnapshot {
    const snapshot = budget();
    allocation(snapshot, 600, "2026-08-01");
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
    useBudgetStore.getState().addSpendingEntry({
      year: 2026,
      month: 8,
      week: 33,
      date: "2026-08-10",
      categoryId: findSeedCategory(snapshot.categories, "cat-spending")!.id,
      amount: 100,
      currency: "USD",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "Tracked",
    });
    return useBudgetStore.getState().snapshot;
  }

  const spendingId = () =>
    useBudgetStore.getState().snapshot.years["2026"].spendingEntries.find((entry) => entry.note === "Tracked")!.id;

  it("reflects a new transaction immediately", () => {
    loaded();
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(500, 6);
  });

  it("reflects a changed amount", () => {
    loaded();
    useBudgetStore.getState().updateSpendingEntry(spendingId(), { amount: 250 });
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(350, 6);
  });

  it("reverses the effect when the transaction is deleted", () => {
    loaded();
    useBudgetStore.getState().removeSpendingEntry(spendingId());
    const state = walletState(useBudgetStore.getState().snapshot);
    expect(state.walletBalance).toBeCloseTo(600, 6);
    expect(state.budgetRemaining).toBeCloseTo(600, 6);
  });

  it("recalculates when the funding classification changes", () => {
    loaded();
    // Somebody else paid after all: it never came out of this wallet.
    useBudgetStore.getState().updateSpendingEntry(spendingId(), { source: "shared" });
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(600, 6);

    // And back again.
    useBudgetStore.getState().updateSpendingEntry(spendingId(), { source: "personal" });
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(500, 6);
  });

  it("moves the spending into the right month when its date changes", () => {
    loaded();
    useBudgetStore.getState().updateSpendingEntry(spendingId(), { date: "2026-09-12" });
    const periods = budgetPeriods(useBudgetStore.getState().snapshot);
    expect(periods.find((period) => period.month === 8)?.spent ?? 0).toBeCloseTo(0, 6);
    expect(periods.find((period) => period.month === 9)!.spent).toBeCloseTo(100, 6);
    // The overall balance is unaffected: the money still left the wallet.
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(500, 6);
  });
});

describe("the planning half, which the wallet does not change", () => {
  it("rounds the requirement up to the next hundred", () => {
    expect(roundUpToHundred(523)).toBe(600);
    expect(roundUpToHundred(601)).toBe(700);
    expect(roundUpToHundred(1000)).toBe(1000);
    expect(roundUpToHundred(0)).toBe(0);
  });

  it("turns a $523 requirement into a $600 monthly budget", () => {
    const snapshot = budget();
    snapshot.years["2026"].activities = [
      fixedActivity("rent", 500),
      fixedActivity("phone", 23),
    ];
    const plan = monthlyBudgetPlan(snapshot, 2026, 8);
    expect(plan.requirement).toBeCloseTo(523, 6);
    expect(plan.suggested).toBe(600);
    // And the dashboard's suggestion is the same calculation, not a second one.
    expect(calculateSuggestedMonthlyBudget(snapshot).suggestedAmount).toBe(600);
  });

  it("stays the same however much money is in the wallet", () => {
    const snapshot = budget();
    snapshot.years["2026"].activities = [fixedActivity("rent", 500), fixedActivity("phone", 23)];
    const before = monthlyBudgetPlan(snapshot, 2026, 8).suggested;

    allocation(snapshot, 600, "2026-08-01");
    personalMoney(snapshot, 5000, "2026-08-02");
    spend(snapshot, 300, "2026-08-05");

    // The plan says what the month *needs*. It cannot be changed by how much
    // cash happens to be lying around.
    expect(monthlyBudgetPlan(snapshot, 2026, 8).suggested).toBe(before);
  });

  it("excludes activities somebody else funds from the amount to plan for", () => {
    const snapshot = budget();
    snapshot.years["2026"].activities = [
      fixedActivity("mine", 500),
      fixedActivity("dads", 400, { id: "act-dads", fundingSource: "other" }),
      fixedActivity("elsewhere", 300, { id: "act-elsewhere", fundingSource: "outside" }),
    ];
    expect(monthlyBudgetPlan(snapshot, 2026, 8).requirement).toBeCloseTo(500, 6);
    expect(monthlyBudgetPlan(snapshot, 2026, 8).suggested).toBe(500);
  });

  it("places an annual charge in its renewal month only", () => {
    const snapshot = budget();
    snapshot.years["2026"].activities = [
      fixedActivity("rent", 500),
      fixedActivity("navigraph", 0, {
        id: "act-navigraph",
        costModel: "fixedYearly",
        recurrenceType: "yearly",
        pricePerMonth: null,
        yearlyEstimate: 81.64,
        nextRenewalDate: "2026-09-14",
      }),
    ];
    // August needs the rent only; September needs the rent and the renewal.
    expect(monthlyBudgetPlan(snapshot, 2026, 8).requirement).toBeCloseTo(500, 6);
    expect(monthlyBudgetPlan(snapshot, 2026, 9).requirement).toBeCloseTo(581.64, 4);
    expect(monthlyBudgetPlan(snapshot, 2026, 9).suggested).toBe(600);
  });

  it("does not fold an activity with no known payment date into the requirement", () => {
    const snapshot = budget();
    snapshot.years["2026"].activities = [
      fixedActivity("rent", 500),
      fixedActivity("undated", 0, {
        id: "act-undated",
        costModel: "fixedYearly",
        recurrenceType: "yearly",
        pricePerMonth: null,
        yearlyEstimate: 240,
      }),
    ];
    const plan = monthlyBudgetPlan(snapshot, 2026, 8);
    expect(plan.requirement).toBeCloseTo(500, 6);
    expect(plan.unscheduledCount).toBe(1);
    expect(plan.unscheduledMonthly).toBeCloseTo(20, 6);
  });
});

describe("the full acceptance scenario", () => {
  it("runs end to end without the two systems interfering", () => {
    const snapshot = budget();
    snapshot.years["2026"].activities = [fixedActivity("rent", 500), fixedActivity("phone", 23)];
    useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
    const state = () => walletState(useBudgetStore.getState().snapshot);
    const store = () => useBudgetStore.getState();

    // 1–2. The requirement is $523, so the monthly budget is $600.
    expect(monthlyBudgetPlan(store().snapshot, 2026, 8).requirement).toBeCloseTo(523, 6);
    expect(monthlyBudgetPlan(store().snapshot, 2026, 8).suggested).toBe(600);

    // 3–6. Record receiving it.
    store().allocateBudget({ amount: 600, currency: "USD", date: "2026-08-01" });
    expect(state().walletBalance).toBeCloseTo(600, 6);
    expect(state().budgetRemaining).toBeCloseTo(600, 6);
    expect(state().personalBalance).toBeCloseTo(0, 6);

    // 7–9. Spend $100 of it.
    store().addSpendingEntry({
      year: 2026, month: 8, week: 33, date: "2026-08-05",
      categoryId: findSeedCategory(store().snapshot.categories, "cat-spending")!.id,
      amount: 100, currency: "USD", recurrenceType: "none", isPiloting: false,
      source: "personal", note: "First",
    });
    expect(state().walletBalance).toBeCloseTo(500, 6);
    expect(state().budgetRemaining).toBeCloseTo(500, 6);

    // 10–13. Add $200 of personal money.
    store().addWalletEntry({
      year: 2026, month: 8, date: "2026-08-06", amount: 200, currency: "USD",
      source: "Gift", type: "personal", note: "",
    });
    expect(state().walletBalance).toBeCloseTo(700, 6);
    expect(state().budgetRemaining).toBeCloseTo(500, 6);
    expect(state().personalBalance).toBeCloseTo(200, 6);

    // 14–15. Spend another $350, leaving $150 of budget, and let the month end.
    store().addSpendingEntry({
      year: 2026, month: 8, week: 35, date: "2026-08-25",
      categoryId: findSeedCategory(store().snapshot.categories, "cat-spending")!.id,
      amount: 350, currency: "USD", recurrenceType: "none", isPiloting: false,
      source: "personal", note: "Second",
    });
    useBudgetStore.setState({
      snapshot: { ...store().snapshot, settings: { ...store().snapshot.settings, selectedMonth: 9 } },
    });
    expect(state().budgetRemaining).toBeCloseTo(150, 6);

    // 16. The app has something to prompt about, and has not touched it.
    expect(leftoverBudget(store().snapshot)).toBeCloseTo(150, 6);

    // 17–20. Transfer it.
    const walletBefore = state().walletBalance;
    store().transferBudgetToPersonal(150);
    expect(state().budgetRemaining).toBeCloseTo(0, 6);
    expect(state().personalBalance).toBeCloseTo(350, 6);
    expect(state().walletBalance).toBeCloseTo(walletBefore, 6);

    // 21–22. Next month's allocation.
    store().allocateBudget({ amount: 600, currency: "USD", date: "2026-09-01" });
    expect(state().budgetRemaining).toBeCloseTo(600, 6);
    expect(state().walletBalance).toBeCloseTo(950, 6);

    // 23. The planning calculation is untouched by any of it.
    expect(monthlyBudgetPlan(store().snapshot, 2026, 9).suggested).toBe(600);

    // 24. Funds from two budget periods coexist without corrupting the plan.
    const periods = budgetPeriods(store().snapshot);
    expect(periods.map((period) => period.month)).toContain(8);
    expect(periods.map((period) => period.month)).toContain(9);
    expect(monthlyBudgetPlan(store().snapshot, 2026, 10).suggested).toBe(600);
  });
});

describe("currencies", () => {
  it("converts a foreign-currency movement through the app's own rates", () => {
    const snapshot = budget();
    snapshot.settings.exchangeRates = { eurUsd: 1.2, usdLbp: 90_000, customToBase: {}, perEur: { EUR: 1, USD: 1.2 } };
    snapshot.years["2026"].walletEntries.push({
      id: "eur-in",
      year: 2026,
      month: 8,
      date: "2026-08-01",
      amount: 100,
      currency: "EUR",
      source: "Euro cash",
      type: "personal",
      note: "",
      createdAt: "2026-08-01T09:00:00.000Z",
    });
    // 100 EUR at 1.2 USD per EUR, in a wallet displayed in dollars.
    expect(walletState(snapshot).walletBalance).toBeCloseTo(120, 6);
    // And the movement keeps the amount and currency it was recorded in.
    const movement = walletState(snapshot).movements[0];
    expect(movement.amountNative).toBe(100);
    expect(movement.currency).toBe("EUR");
  });
});
