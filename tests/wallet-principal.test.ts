import { beforeEach, describe, expect, it } from "vitest";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import { useBudgetStore } from "../src/store/budgetStore";
import { walletComposition, walletState } from "../src/domain/wallet";
import type { BudgetSnapshot, CurrencyCode, ExchangeRates } from "../src/domain/types";

/**
 * 200 USD is 200 USD, whatever it is worth today
 * ==============================================
 *
 * The canonical form of every wallet entry is an **amount and a currency**.
 * The display currency and the exchange rate decide what that is *shown as*,
 * and must never decide what it *is*.
 *
 * The failure this guards against is subtle because it looks like a rounding
 * problem: convert 200 USD into euros to store it, convert it back to dollars
 * to show it, and the number that comes out is not the number that went in. Do
 * that twice, with a rate change in between, and 200 becomes 201. The stored
 * figure would then be a record of an exchange rate rather than of money.
 *
 * So the whole sequence from the specification is walked here, and the
 * assertion at every stage is on the **stored** entry rather than on anything
 * rendered:
 *
 *   create 200 USD → display EUR → rate A → rate B → display USD → reload.
 *
 * Any implementation that round-trips the principal through the display
 * currency fails at step three.
 */

const NOW = new Date("2026-08-31T12:00:00Z");

function rates(usdPerEur: number): ExchangeRates {
  return {
    eurUsd: usdPerEur,
    usdLbp: 90_000,
    customToBase: {},
    perEur: { USD: usdPerEur, GBP: 0.84 },
  };
}

function withWallet(): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.exchangeRates = rates(1.16);
  const year = String(snapshot.settings.selectedYear);
  snapshot.years[year].walletEntries = [];
  return snapshot;
}

/** The stored entry, straight out of the snapshot. No selectors, no formatting. */
function stored(): { amount: number; currency: CurrencyCode } {
  const snapshot = useBudgetStore.getState().snapshot;
  const year = String(snapshot.settings.selectedYear);
  const entry = snapshot.years[year].walletEntries.find((row) => row.source === "Cash gift");
  if (!entry) throw new Error("the wallet entry is gone");
  return { amount: entry.amount, currency: entry.currency };
}

function setDisplayCurrency(currency: CurrencyCode) {
  useBudgetStore.getState().updateSettings({ baseCurrency: currency });
}

function setRate(usdPerEur: number) {
  useBudgetStore.getState().updateSettings({ exchangeRates: rates(usdPerEur) });
}

beforeEach(() => {
  useBudgetStore.setState({
    snapshot: withWallet(),
    hydrated: true,
    undoStack: [],
    redoStack: [],
  });
  useBudgetStore.getState().addWalletEntry({
    year: 2026,
    month: 8,
    date: "2026-08-31",
    amount: 200,
    currency: "USD",
    source: "Cash gift",
    type: "personal",
    note: "",
  });
});

describe("the stored principal", () => {
  it("is 200 USD the moment it is written", () => {
    expect(stored()).toEqual({ amount: 200, currency: "USD" });
  });

  it("walks the whole sequence from the specification and never moves", () => {
    // 1–2. Created in USD, displayed in EUR.
    expect(stored()).toEqual({ amount: 200, currency: "USD" });

    // 3. Rate A.
    setRate(1.16);
    expect(stored()).toEqual({ amount: 200, currency: "USD" });

    // 4. Recalculate — every selector that reads the wallet.
    walletState(useBudgetStore.getState().snapshot);
    walletComposition(useBudgetStore.getState().snapshot);
    expect(stored()).toEqual({ amount: 200, currency: "USD" });

    // 5. Rate B, a materially different one.
    setRate(1.02);
    expect(stored()).toEqual({ amount: 200, currency: "USD" });

    // 6. Recalculate again.
    walletState(useBudgetStore.getState().snapshot);
    expect(stored()).toEqual({ amount: 200, currency: "USD" });

    // 7. Display currency back to USD — the step that would expose a stored
    //    figure that had been round-tripped through euros.
    setDisplayCurrency("USD");
    expect(stored()).toEqual({ amount: 200, currency: "USD" });

    // 8. And what it now *shows* is exactly 200, not 201 and not 199.99.
    const composition = walletComposition(useBudgetStore.getState().snapshot);
    expect(composition).toHaveLength(1);
    expect(composition[0].amount).toBe(200);
    expect(composition[0].converted).toBe(200);
  });

  it("survives a tour through several display currencies", () => {
    for (const currency of ["USD", "EUR", "USD", "GBP", "USD", "EUR"] as CurrencyCode[]) {
      setDisplayCurrency(currency);
      expect(stored(), `after switching to ${currency}`).toEqual({ amount: 200, currency: "USD" });
    }
  });

  it("survives an unrelated wallet entry being added beside it", () => {
    useBudgetStore.getState().addWalletEntry({
      year: 2026,
      month: 8,
      date: "2026-08-31",
      amount: 50,
      currency: "EUR",
      source: "Something else",
      type: "personal",
      note: "",
    });
    expect(stored()).toEqual({ amount: 200, currency: "USD" });
  });

  it("survives a rate refresh writing new rates into settings", () => {
    // The path the application takes on every open.
    useBudgetStore.getState().updateSettings({
      exchangeRates: { ...rates(1.09), ratesUpdatedAt: new Date().toISOString(), ratesSource: "open.er-api.com" },
    });
    expect(stored()).toEqual({ amount: 200, currency: "USD" });
  });

  it("is what comes back out of a save and reload", () => {
    /*
     * Persistence round trip. The snapshot is JSON, so this is the shape that
     * reaches the database and comes back — if anything converted on the way
     * in or out, it shows here.
     */
    const saved = JSON.parse(JSON.stringify(useBudgetStore.getState().snapshot)) as BudgetSnapshot;
    useBudgetStore.setState({ snapshot: saved });
    setDisplayCurrency("USD");
    expect(stored()).toEqual({ amount: 200, currency: "USD" });
  });

  it("zeroes a foreign balance in its own currency, so it stays zero when the rate moves", () => {
    /*
     * The defect this found. The reset used to write one adjustment for the
     * whole balance in the *display* currency: a wallet holding 200 USD against
     * a euro display was zeroed with −€172.43, and the moment the rate moved
     * the two sides stopped cancelling — the balance drifted back to a few
     * euros out of nothing, because only one side of the pair was affected by
     * the rate.
     */
    useBudgetStore.getState().resetWallet();
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(0, 6);

    // The rate moves by a lot. A converted reset would leave a residue here.
    setRate(1.02);
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(0, 6);

    setRate(0.9);
    expect(walletState(useBudgetStore.getState().snapshot).walletBalance).toBeCloseTo(0, 6);

    // And the original entry is still exactly what it was: a reset adds a
    // balancing record, it does not rewrite history.
    expect(stored()).toEqual({ amount: 200, currency: "USD" });
  });

  it("reports a composition whose amount is the principal and whose share is the lens", () => {
    /*
     * The distinction the whole section rests on: `amount` is the money, and
     * `converted` exists only so two currencies can be compared. Nothing reads
     * `converted` back into `amount`.
     */
    useBudgetStore.getState().addWalletEntry({
      year: 2026,
      month: 8,
      date: "2026-08-31",
      amount: 200,
      currency: "EUR",
      source: "Euro cash",
      type: "personal",
      note: "",
    });

    const composition = walletComposition(useBudgetStore.getState().snapshot);
    const usd = composition.find((slice) => slice.currency === "USD")!;
    const eur = composition.find((slice) => slice.currency === "EUR")!;

    expect(usd.amount).toBe(200);
    expect(eur.amount).toBe(200);
    // Converted at 1.16 USD per EUR, 200 USD is worth less than €200, so the
    // euro side is the larger share — and both principals are still 200.
    expect(usd.converted).toBeLessThan(eur.converted);
    expect((usd.share ?? 0) + (eur.share ?? 0)).toBeCloseTo(100, 6);
  });
});
