/**
 * Resetting the wallet
 * ====================
 *
 * "Reset wallet" means one thing and one thing only: the balance reads zero.
 * It is not a reset of the application, of the account, or of the transactions
 * — and the tests below exist to keep it that way, because the name is one
 * word away from three far more destructive operations.
 *
 * It is implemented as a balancing adjustment rather than a deletion. Wallet
 * entries record money that moved; erasing them to make a figure read zero
 * destroys history to fix a display.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useBudgetStore } from "../src/store/budgetStore";
import { resolveStoredText } from "../src/domain/storedText";
import { createTranslator } from "../src/domain/i18n";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { calculateYear } from "../src/domain/calculations";
import { walletState } from "../src/domain/wallet";
import type { BudgetSnapshot } from "../src/domain/types";

const NOW = new Date("2026-08-10T12:00:00Z");

function load(snapshot: BudgetSnapshot = createSeedBudgetSnapshot(NOW)) {
  useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [], historicalEditUnlocked: false });
  return snapshot;
}

function walletTotal(): number {
  // The real balance across the whole ledger — see `domain/wallet.ts`.
  return walletState(useBudgetStore.getState().snapshot).walletBalance;
}

afterEach(() => load());

describe("resetting the wallet", () => {
  it("makes the balance exactly zero", () => {
    const snapshot = load();
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 8;
    expect(walletTotal()).not.toBe(0);

    useBudgetStore.getState().resetWallet();

    expect(walletTotal()).toBe(0);
    expect(calculateYear(useBudgetStore.getState().snapshot, NOW).wallet.walletTotal).toBe(0);
  });

  it("writes one balancing adjustment rather than deleting the history", () => {
    const snapshot = load();
    const before = snapshot.years["2026"].walletEntries.length;
    const balance = walletTotal();

    const written = useBudgetStore.getState().resetWallet();

    const after = useBudgetStore.getState().snapshot.years["2026"].walletEntries;
    expect(after).toHaveLength(before + 1);
    expect(written).toBeCloseTo(-balance, 6);
    const adjustment = after[after.length - 1];
    expect(adjustment.type).toBe("adjustment");
    // A translation key, not a sentence: the store has no language, so the
    // ledger reads in whatever language the user is using when they look at
    // it rather than the one they were using when they pressed the button.
    expect(adjustment.source).toBe("@wallet.resetSource");
    expect(adjustment.amount).toBeCloseTo(-balance, 6);
  });

  it("releases the budget claim too, so all three balances land on zero", () => {
    /*
     * Zeroing the cash while leaving €600 of budget money "still available"
     * asserts a contradiction the user can see, and drives the personal
     * balance to −€600. The reset releases the claim first.
     */
    const snapshot = load();
    snapshot.years["2026"].walletEntries.push({
      id: "alloc-for-reset",
      year: 2026,
      month: 8,
      date: "2026-08-01",
      amount: 600,
      currency: snapshot.settings.baseCurrency,
      source: "Budget",
      type: "budget",
      note: "",
      createdAt: "2026-08-01T09:00:00.000Z",
    });
    load(snapshot);
    expect(walletState(useBudgetStore.getState().snapshot).budgetRemaining).toBeCloseTo(600, 6);

    useBudgetStore.getState().resetWallet();

    const after = walletState(useBudgetStore.getState().snapshot);
    expect(after.walletBalance).toBe(0);
    expect(after.budgetRemaining).toBeCloseTo(0, 6);
    expect(after.personalBalance).toBeCloseTo(0, 6);
  });

  it("leaves every unrelated record untouched", () => {
    const snapshot = load();
    const before = {
      spending: snapshot.years["2026"].spendingEntries.length,
      activities: snapshot.years["2026"].activities.length,
      wishlist: snapshot.years["2026"].wishlistItems.length,
      categories: snapshot.categories.length,
      budget: snapshot.settings.monthlyBudget,
      approvals: snapshot.budgetApprovals.length,
      closed: snapshot.years["2026"].closedMonths.length,
    };

    useBudgetStore.getState().resetWallet();

    const after = useBudgetStore.getState().snapshot;
    expect(after.years["2026"].spendingEntries).toHaveLength(before.spending);
    expect(after.years["2026"].activities).toHaveLength(before.activities);
    expect(after.years["2026"].wishlistItems).toHaveLength(before.wishlist);
    expect(after.categories).toHaveLength(before.categories);
    expect(after.settings.monthlyBudget).toBe(before.budget);
    expect(after.budgetApprovals).toHaveLength(before.approvals);
    expect(after.years["2026"].closedMonths).toHaveLength(before.closed);
  });

  it("does nothing at all when the balance is already zero", () => {
    const snapshot = load();
    snapshot.years["2026"].walletEntries = [];
    load(snapshot);

    const written = useBudgetStore.getState().resetWallet();

    // A €0.00 adjustment in the ledger forever is noise, so nothing is written
    // and the caller is told the difference.
    expect(written).toBeNull();
    expect(useBudgetStore.getState().snapshot.years["2026"].walletEntries).toHaveLength(0);
    expect(walletTotal()).toBe(0);
  });

  it("is recorded in the audit trail", () => {
    load();
    useBudgetStore.getState().resetWallet();
    const entry = useBudgetStore.getState().snapshot.auditLog[0];
    expect(entry.type).toBe("wallet");
    // A translation key, not a sentence: the store has no language, and the
    // audit trail outlives the session that wrote it. See domain/storedText.ts.
    expect(entry.summary).toBe("@audit.walletReset");
    expect(resolveStoredText(entry.summary, createTranslator("en"))).toMatch(/wallet balance to zero/i);
  });

  it("survives a reload — it is in the snapshot, not in a component", () => {
    load();
    useBudgetStore.getState().resetWallet();
    // Serialising and rehydrating is exactly what a reload does.
    const persisted = JSON.parse(JSON.stringify(useBudgetStore.getState().snapshot)) as BudgetSnapshot;
    load(persisted);
    expect(walletTotal()).toBe(0);
  });

  it("can be undone", () => {
    const snapshot = load();
    const before = walletState(snapshot).walletBalance;
    useBudgetStore.getState().resetWallet();
    expect(walletTotal()).toBe(0);

    useBudgetStore.getState().undo();

    expect(walletTotal()).toBeCloseTo(before, 6);
  });

  it("is refused while a historical period is locked", () => {
    const snapshot = load();
    snapshot.settings.selectedPeriodMode = "month";
    snapshot.settings.selectedYear = 2026;
    snapshot.settings.selectedMonth = 6;
    load(snapshot);
    const before = useBudgetStore.getState().snapshot.years["2026"].walletEntries.length;

    expect(useBudgetStore.getState().resetWallet()).toBeNull();
    expect(useBudgetStore.getState().snapshot.years["2026"].walletEntries).toHaveLength(before);
  });
});
