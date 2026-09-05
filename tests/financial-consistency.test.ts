import { describe, expect, it, beforeEach } from "vitest";
import { createEmptyBudgetSnapshot } from "../src/data/seedBudget";
import { useBudgetStore } from "../src/store/budgetStore";
import { walletState } from "../src/domain/wallet";
import type { BudgetSnapshot, CurrencyCode } from "../src/domain/types";
import { freezeClockAt } from "./lib/clock";

// January must be the *current* month for `isCurrentPeriodMutable()` to
// allow writes against it; February is a future month by this clock, which
// `isHistoricalPeriod()` only blocks for months strictly before "now."
freezeClockAt("2026-01-15T09:00:00Z");

/**
 * Phase 5.18 — Financial Consistency Test (brief §27)
 * ====================================================
 *
 * A realistic, multi-month scenario driven through the real store actions —
 * not the read-side math in isolation — covering every category the brief
 * names: normal expenses, Paid by Other, Outside Budget, a recurring
 * activity, budget allocations, wallet activity, personal money, multiple
 * categories, and a second currency. After each step, three things are
 * checked:
 *
 *  1. **The identity always holds.** `personalBalance` is defined as
 *     `walletBalance − budgetRemaining` (`domain/wallet.ts`), which makes it
 *     true by construction on every *read* — the point of asserting it after
 *     every single mutation below is to catch a future edit that computes one
 *     of the three some other way, or that stops routing through `walletState`
 *     at all.
 *  2. **Concrete numbers**, computed by hand from the known inputs, at the
 *     checkpoints that matter — an internally-consistent identity would also
 *     hold for three wrong numbers that happen to agree with each other.
 *  3. **What must NOT move.** Paid by Other and Outside Budget spending must
 *     leave all three balances exactly where they were; adding a recurring
 *     activity must not touch the treasury at all, because activities feed
 *     the *Planning* system (`monthlyBudgetPlan`), not the ledger this file
 *     reads — the Planning/Treasury separation Phase 5.13 is built on.
 */

function fresh(): BudgetSnapshot {
  const snapshot = createEmptyBudgetSnapshot();
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.monthlyBudgetCurrency = "EUR";
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 1;
  snapshot.settings.monthlyBudget = 0;
  snapshot.settings.exchangeRates = {
    eurUsd: 1.0873,
    usdLbp: 89_411,
    customToBase: {},
    perEur: { USD: 1.0873, GBP: 0.8431, CHF: 0.9407, LBP: 97_223, JPY: 163.17 } as never,
  };
  snapshot.settings.trackedCurrencies = ["EUR", "USD"];
  const year = snapshot.years["2026"] ?? Object.values(snapshot.years)[0];
  snapshot.years = {
    "2026": { ...year, year: 2026, activities: [], spendingEntries: [], wishlistItems: [], walletEntries: [], closedMonths: [] },
  };
  return snapshot;
}

function load(snapshot: BudgetSnapshot): void {
  useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
}

const store = () => useBudgetStore.getState();
const wallet = () => walletState(store().snapshot);

/** The one identity that must survive every mutation below. */
function expectIdentity() {
  const w = wallet();
  expect(w.personalBalance).toBeCloseTo(w.walletBalance - w.budgetRemaining, 6);
}

beforeEach(() => {
  load(fresh());
});

describe("a realistic multi-month budget, checked at every step", () => {
  it("keeps Main Wallet, Remaining Budget and Personal Balance coherent throughout", () => {
    // ── January: nothing recorded yet ──────────────────────────────────────
    expectIdentity();
    expect(wallet().walletBalance).toBe(0);
    expect(wallet().budgetRemaining).toBe(0);
    expect(wallet().personalBalance).toBe(0);

    // ── A monthly budget arrives: €500 allocated ───────────────────────────
    store().allocateBudget({ amount: 500, currency: "EUR", date: "2026-01-02", note: "January budget" });
    expectIdentity();
    expect(wallet().walletBalance).toBe(500);
    expect(wallet().budgetRemaining).toBe(500);
    expect(wallet().personalBalance).toBe(0);

    // ── Personal money, deliberately outside the budget's own allocation ───
    store().addWalletEntry({
      year: 2026,
      month: 1,
      date: "2026-01-03",
      amount: 200,
      currency: "EUR",
      source: "Birthday gift",
      type: "personal",
      note: "",
    });
    expectIdentity();
    // Real cash went up; the budget's own allocation did not.
    expect(wallet().walletBalance).toBe(700);
    expect(wallet().budgetRemaining).toBe(500);
    expect(wallet().personalBalance).toBe(200);

    // ── A normal expense: paid by me, in budget ─────────────────────────────
    const categories = store().snapshot.categories;
    store().addSpendingEntry({
      year: 2026,
      month: 1,
      week: 1,
      date: "2026-01-05",
      categoryId: categories[0].id,
      amount: 80,
      currency: "EUR",
      recurrenceType: "none",
      source: "personal",
      note: "Groceries",
    });
    expectIdentity();
    // Real money spent (wallet down) AND budget consumed (remaining down) —
    // the one funding kind that touches both sides of the treasury.
    expect(wallet().walletBalance).toBe(620);
    expect(wallet().budgetRemaining).toBe(420);
    expect(wallet().personalBalance).toBe(200);

    // ── Paid by Other: recorded in full, touches neither balance ────────────
    const beforeOther = wallet();
    store().addSpendingEntry({
      year: 2026,
      month: 1,
      week: 1,
      date: "2026-01-06",
      categoryId: categories[0].id,
      amount: 50,
      currency: "EUR",
      recurrenceType: "none",
      source: "shared",
      note: "Dinner a friend covered",
    });
    expectIdentity();
    expect(wallet().walletBalance).toBe(beforeOther.walletBalance);
    expect(wallet().budgetRemaining).toBe(beforeOther.budgetRemaining);
    expect(wallet().personalBalance).toBe(beforeOther.personalBalance);

    // ── Outside Budget: the reader's own money, kept off this budget ───────
    const beforeOutside = wallet();
    store().addSpendingEntry({
      year: 2026,
      month: 1,
      week: 1,
      date: "2026-01-07",
      categoryId: categories[0].id,
      amount: 30,
      currency: "EUR",
      recurrenceType: "none",
      source: "external",
      note: "Business expense, tracked elsewhere",
    });
    expectIdentity();
    expect(wallet().walletBalance).toBe(beforeOutside.walletBalance);
    expect(wallet().budgetRemaining).toBe(beforeOutside.budgetRemaining);
    expect(wallet().personalBalance).toBe(beforeOutside.personalBalance);

    // ── A recurring activity: Planning, not Treasury ────────────────────────
    const beforeActivity = wallet();
    store().addActivity({
      name: "Gym",
      categoryId: categories[0].id,
      pricePerMonth: 40,
      currency: "EUR",
      recurrenceType: "monthly",
      recurrenceInterval: 1,
      active: true,
      visible: true,
      notes: "",
      costModel: "fixed",
    } as never);
    expectIdentity();
    // Adding an activity changes what the Planning system will *suggest* next
    // month; it must not move a single figure this file reads, because those
    // come entirely from the ledger and recorded spending, never from the
    // activity list.
    expect(wallet()).toEqual(beforeActivity);

    // ── Multiple categories: a second category, another personal expense ───
    if (categories.length > 1) {
      store().addSpendingEntry({
        year: 2026,
        month: 1,
        week: 2,
        date: "2026-01-10",
        categoryId: categories[1].id,
        amount: 20,
        currency: "EUR",
        recurrenceType: "none",
        source: "personal",
        note: "A different category",
      });
      expectIdentity();
      expect(wallet().walletBalance).toBe(600);
      expect(wallet().budgetRemaining).toBe(400);
    }

    // ── A second currency: converts, but the identity still holds ──────────
    store().addSpendingEntry({
      year: 2026,
      month: 1,
      week: 2,
      date: "2026-01-12",
      categoryId: categories[0].id,
      amount: 10,
      currency: "USD",
      recurrenceType: "none",
      source: "personal",
      note: "Paid in dollars",
    });
    expectIdentity();

    // ── Close January, with a monthly cap set and an écart to roll over ────
    store().updateSettings({ monthlyBudget: 100 });
    const beforeClose = wallet();
    store().closeMonth(2026, 1, true);
    expectIdentity();
    // Phase 5.2's confirmed policy: the écart moves Personal Balance, and
    // Remaining Budget — a separate, continuous ledger — is untouched by the
    // close itself (it already reflects the month's own allocations and
    // spending, which do not change just because the month ended).
    expect(wallet().budgetRemaining).toBe(beforeClose.budgetRemaining);
    expect(wallet().personalBalance).not.toBe(beforeClose.personalBalance);
    expect(wallet().walletBalance).toBe(wallet().budgetRemaining + wallet().personalBalance);

    // ── February: budget carries forward, a fresh allocation arrives ───────
    store().updateSettings({ selectedYear: 2026, selectedMonth: 2 });
    const beforeFeb = wallet();
    store().allocateBudget({ amount: 300, currency: "EUR", date: "2026-02-01", note: "February budget" });
    expectIdentity();
    expect(wallet().budgetRemaining).toBe(beforeFeb.budgetRemaining + 300);
    expect(wallet().walletBalance).toBe(beforeFeb.walletBalance + 300);
    expect(wallet().personalBalance).toBe(beforeFeb.personalBalance);
  });
});
