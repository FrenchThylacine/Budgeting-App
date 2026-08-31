import { describe, expect, it } from "vitest";
import { currencyDistribution, entriesForSelectedPeriod } from "../src/domain/analytics";
import { walletComposition } from "../src/domain/wallet";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { BudgetSnapshot, SpendingEntry } from "../src/domain/types";

/**
 * In what, not just how much
 * ==========================
 *
 * Every other figure on the statistics page converts into the display
 * currency, which is the right answer to "how much" and the wrong answer to
 * "in what". Somebody paying a Beirut rent in dollars and buying lunch in
 * euros did not spend "€190.45 across two currencies" — they spent a hundred
 * and twenty dollars and eighty euros, and the euro figure exists only so the
 * two can share a bar.
 *
 * So the rule this file holds is the one the wallet already follows:
 * **`amount` is the fact and `converted` is a lens.** Nothing derives an
 * amount from a conversion, and no rate changes what was recorded.
 */

const NOW = new Date("2026-08-15T09:00:00Z");

function budget(entries: Partial<SpendingEntry>[]): BudgetSnapshot {
  const snapshot = createSeedBudgetSnapshot(NOW);
  snapshot.settings.baseCurrency = "EUR";
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.selectedPeriodMode = "month";
  snapshot.settings.exchangeRates = {
    ...snapshot.settings.exchangeRates,
    eurUsd: 1.2,
    perEur: { USD: 1.2, GBP: 0.8 },
  };
  const year = String(snapshot.settings.selectedYear);
  snapshot.years[year].spendingEntries = entries.map((entry, index) => ({
    id: `sp-${index}`,
    year: 2026,
    month: 8,
    week: 33,
    date: "2026-08-14",
    categoryId: snapshot.categories[0].id,
    amount: 0,
    currency: "EUR",
    recurrenceType: "none",
    note: "",
    ...entry,
  })) as SpendingEntry[];
  return snapshot;
}

const distributionOf = (snapshot: BudgetSnapshot) =>
  currencyDistribution(entriesForSelectedPeriod(snapshot, snapshot.settings), snapshot);

describe("the amounts", () => {
  it("reports what was recorded, in the currency it was recorded in", () => {
    const snapshot = budget([
      { amount: 120, currency: "USD" },
      { amount: 80, currency: "EUR" },
    ]);
    const slices = distributionOf(snapshot);
    // Ordered by what the money is worth — $120 is €100, which is more than
    // €80 — and each amount is still the one that was typed.
    expect(slices.map((slice) => [slice.currency, slice.amount])).toEqual([
      ["USD", 120],
      ["EUR", 80],
    ]);
  });

  it("does not move when the exchange rate does", () => {
    /*
     * The whole point. A rate is a fact about today; what somebody paid is a
     * fact about the day they paid it, and one must never rewrite the other.
     */
    const snapshot = budget([{ amount: 120, currency: "USD" }]);
    const before = distributionOf(snapshot)[0];

    snapshot.settings.exchangeRates = { ...snapshot.settings.exchangeRates, eurUsd: 1.05, perEur: { USD: 1.05 } };
    const after = distributionOf(snapshot)[0];

    expect(after.amount).toBe(before.amount);
    expect(after.amount).toBe(120);
    // The lens moved, which is what a lens is for.
    expect(after.converted).not.toBeCloseTo(before.converted, 6);
  });

  it("converts only for comparison, and at the stated rate", () => {
    const snapshot = budget([{ amount: 120, currency: "USD" }]);
    const [usd] = distributionOf(snapshot);
    // 120 USD at 1.2 USD per EUR is €100.
    expect(usd.converted).toBeCloseTo(100, 6);
  });

  it("orders by what the shares actually are, largest first", () => {
    // Not alphabetically, and not by the raw number: 500 SEK is not more than
    // 200 EUR because 500 is a bigger number.
    const snapshot = budget([
      { amount: 12, currency: "USD" },
      { amount: 200, currency: "EUR" },
      { amount: 60, currency: "GBP" },
    ]);
    expect(distributionOf(snapshot).map((slice) => slice.currency)).toEqual(["EUR", "GBP", "USD"]);
  });
});

describe("the shares", () => {
  it("adds up to a hundred", () => {
    const snapshot = budget([
      { amount: 120, currency: "USD" },
      { amount: 80, currency: "EUR" },
      { amount: 40, currency: "GBP" },
    ]);
    const total = distributionOf(snapshot).reduce((sum, slice) => sum + (slice.share ?? 0), 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("says nothing rather than dividing by zero", () => {
    // Zero is a real value in this application, and a budget where everything
    // recorded came to nothing has no shares — not shares of zero.
    const snapshot = budget([{ amount: 0, currency: "USD" }]);
    const [usd] = distributionOf(snapshot);
    expect(usd.amount).toBe(0);
    expect(usd.share).toBeNull();
    expect(usd.count).toBe(1);
  });

  it("counts the transactions, because a total alone misleads", () => {
    /*
     * One $2,000 flight and forty €12 lunches make dollars look like the
     * currency this budget lives in. The count is what says otherwise.
     */
    const snapshot = budget([
      { amount: 2000, currency: "USD" },
      ...Array.from({ length: 40 }, () => ({ amount: 12, currency: "EUR" as const })),
    ]);
    const slices = distributionOf(snapshot);
    expect(slices.find((slice) => slice.currency === "USD")!.count).toBe(1);
    expect(slices.find((slice) => slice.currency === "EUR")!.count).toBe(40);
  });
});

describe("edges", () => {
  it("reports nothing for a period with nothing in it", () => {
    expect(distributionOf(budget([]))).toEqual([]);
  });

  it("treats an entry with no currency as the display currency", () => {
    // What every record written before currencies existed looks like.
    const snapshot = budget([{ amount: 50, currency: undefined as never }]);
    const [only] = distributionOf(snapshot);
    expect(only.currency).toBe("EUR");
    expect(only.amount).toBe(50);
  });

  it("agrees with the wallet's own composition about what a slice means", () => {
    /*
     * Two selectors, one rule. The statistics page shows both side by side, so
     * a disagreement about whether `amount` is the principal or the conversion
     * would be visible as two figures for one currency on one screen.
     */
    const snapshot = budget([]);
    const year = String(snapshot.settings.selectedYear);
    snapshot.years[year].walletEntries = [
      {
        id: "w1",
        year: 2026,
        month: 8,
        date: "2026-08-01",
        amount: 200,
        currency: "USD",
        source: "Cash",
        type: "personal",
        note: "",
      },
    ] as never;

    const [usd] = walletComposition(snapshot);
    expect(usd.currency).toBe("USD");
    expect(usd.amount).toBe(200);
    expect(usd.converted).toBeCloseTo(200 / 1.2, 6);
  });
});
