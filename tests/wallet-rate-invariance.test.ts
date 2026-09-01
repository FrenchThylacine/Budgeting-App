import { describe, expect, it } from "vitest";
import { createEmptyBudgetSnapshot } from "../src/data/seedBudget";
import { useBudgetStore } from "../src/store/budgetStore";
import { budgetComposition, walletComposition, walletState } from "../src/domain/wallet";
import { currencyDistribution } from "../src/domain/analytics";
import type { BudgetSnapshot, CurrencyCode, ExchangeRates, WalletEntry } from "../src/domain/types";
import { freezeClockAt } from "./lib/clock";

freezeClockAt("2026-08-15T09:00:00Z");

/**
 * The stored principal is sacred
 * ==============================
 *
 * `wallet-principal.test.ts` already walks the specification's own sequence and
 * asserts that 200 USD stays 200 USD. This suite is the adversarial half, and
 * it exists because the sibling suite passed while a real instance of the same
 * bug was live in the store.
 *
 * The difference is what is asserted. Asserting "the amount I typed is still
 * the amount that is stored" catches a principal being rewritten. It does not
 * catch what actually went wrong, which is subtler and worse:
 *
 *   **an entry written to cancel another entry, denominated differently.**
 *
 * The wallet reset wrote its cash adjustments in each currency held — correct,
 * deliberate, commented — and released the *budget claim* as a single figure
 * converted into the display currency. Every stored principal was untouched.
 * Every test passed. And a wallet the reader had just emptied grew €18.06 of
 * budget money the next time the rate provider answered, because the two sides
 * of the reset were denominated differently and only one of them moved with
 * the rate.
 *
 * So the assertions here are of three kinds, and the second and third are the
 * ones that earn their place:
 *
 *  1. every stored `amount` and `currency` is byte-identical after anything
 *     that is not an explicit user edit (§2.2, §2.3, §2.5, §2.6, §2.8);
 *  2. a *settled* derived figure stays settled at every rate — if the wallet
 *     nets to zero at one rate it nets to zero at all of them (§2.5);
 *  3. everything that reads the wallet reads the same underlying fact (§2.7).
 *
 * And the matrix is adversarial rather than illustrative: currencies three
 * orders of magnitude apart, reciprocal pairs, amounts from a hundredth of a
 * unit to a million and a half, rates that fail to arrive, and long refresh
 * loops — because a conversion error that is invisible once is obvious after
 * forty (§2.4, §2.6, §2.10).
 */

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Rates as the provider publishes them: units of each currency per one euro.
 *
 * Deliberately awkward numbers. Round rates round-trip through a conversion
 * and back by luck, which is the one thing a test of conversions must not do.
 */
function rates(over: Partial<Record<CurrencyCode, number>> = {}): ExchangeRates {
  return {
    eurUsd: over.USD ?? 1.0873,
    usdLbp: 89_411,
    customToBase: {},
    perEur: {
      USD: 1.0873,
      GBP: 0.8431,
      CHF: 0.9407,
      LBP: 97_223,
      JPY: 163.17,
      ...over,
    } as ExchangeRates["perEur"],
  };
}

function fresh(base: CurrencyCode = "EUR"): BudgetSnapshot {
  const snapshot = createEmptyBudgetSnapshot();
  snapshot.settings.baseCurrency = base;
  snapshot.settings.monthlyBudgetCurrency = base;
  snapshot.settings.selectedYear = 2026;
  snapshot.settings.selectedMonth = 8;
  snapshot.settings.exchangeRates = rates();
  snapshot.settings.trackedCurrencies = ["EUR", "USD", "GBP", "CHF", "LBP", "JPY"];
  // Whatever the empty snapshot already builds for the year, emptied — rather
  // than a literal here, which would fall behind `YearRecord` the first time a
  // field is added to it.
  const year = snapshot.years["2026"] ?? Object.values(snapshot.years)[0];
  snapshot.years = { "2026": { ...year, year: 2026, activities: [], spendingEntries: [], wishlistItems: [], walletEntries: [], closedMonths: [] } };
  return snapshot;
}

function load(snapshot: BudgetSnapshot): void {
  useBudgetStore.setState({ snapshot, hydrated: true, undoStack: [], redoStack: [] });
}

const store = () => useBudgetStore.getState();
const snapshotNow = () => store().snapshot;

/** Every stored money value in the snapshot, as it sits on disk. */
function principals(snapshot: BudgetSnapshot): { amount: number; currency: CurrencyCode; id: string }[] {
  return Object.values(snapshot.years)
    .flatMap((record) => record.walletEntries as WalletEntry[])
    .map((entry) => ({ id: entry.id, amount: entry.amount, currency: entry.currency }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Change the display currency the way the settings panel does. */
function display(currency: CurrencyCode): void {
  store().updateSettings({ baseCurrency: currency });
}

/** Replace the rate table the way the rate provider does. */
function refresh(over: Partial<Record<CurrencyCode, number>> = {}): void {
  store().updateSettings({ exchangeRates: rates(over) });
}

/** Render everything that reads the wallet, so a selector cannot be skipped. */
function renderEverything(): void {
  const snapshot = snapshotNow();
  walletState(snapshot);
  walletComposition(snapshot);
  budgetComposition(snapshot);
  currencyDistribution(
    Object.values(snapshot.years).flatMap((record) => record.spendingEntries),
    snapshot,
  );
}

// ─── §2.3 The specification's own sequence ───────────────────────────────────

describe("200 USD, against every display currency in turn", () => {
  it("is still 200 USD at every stage, and after a reload", () => {
    load(fresh("EUR"));
    store().addWalletEntry({
      id: "principal",
      year: 2026,
      month: 8,
      date: "2026-08-05",
      amount: 200,
      currency: "USD",
      source: "Salary",
      type: "personal",
      note: "",
    });

    const stored = () => principals(snapshotNow()).find((entry) => entry.id === "principal");
    const stages: string[] = [];
    const check = (stage: string) => {
      renderEverything();
      const entry = stored();
      stages.push(stage);
      expect(entry, stage).toEqual({ id: "principal", amount: 200, currency: "USD" });
    };

    check("as written");
    display("EUR");
    check("display EUR");
    refresh({ USD: 1.2214 });
    check("after the rate moved");
    display("CHF");
    check("display CHF");
    display("GBP");
    check("display GBP");
    display("LBP");
    check("display LBP");
    display("EUR");
    check("back to EUR");
    display("USD");
    check("display USD — its own currency");

    // A reload: the snapshot goes out and comes back, exactly as it does
    // through IndexedDB and the server.
    const roundTripped = JSON.parse(JSON.stringify(snapshotNow())) as BudgetSnapshot;
    load(roundTripped);
    check("after a reload");

    // A hydration: the server's copy replaces the local one wholesale, which
    // is the moment the brief singles out — `importSnapshot` is the same code
    // path `hydrate` takes once the response has landed.
    store().importSnapshot(roundTripped);
    check("after hydration");

    refresh({ USD: 0.9902 });
    check("after a rate refresh");

    expect(stages).toHaveLength(11);
  });
});

// ─── §2.4 and §2.10 The adversarial matrix ───────────────────────────────────

describe("every currency combination the brief names", () => {
  const CASES: { amount: number; currency: CurrencyCode; through: CurrencyCode[] }[] = [
    { amount: 100, currency: "USD", through: ["EUR", "USD"] },
    { amount: 200, currency: "USD", through: ["EUR", "CHF", "USD"] },
    { amount: 50, currency: "EUR", through: ["USD", "EUR"] },
    { amount: 10, currency: "GBP", through: ["EUR", "USD", "GBP"] },
    { amount: 1_500_000, currency: "LBP", through: ["EUR", "LBP"] },
    { amount: 100, currency: "CHF", through: ["USD", "EUR", "CHF"] },
    // §2.10: the awkward magnitudes, on both sides of what a currency displays.
    { amount: 0.01, currency: "EUR", through: ["USD", "LBP", "EUR"] },
    { amount: 0.05, currency: "USD", through: ["LBP", "JPY", "USD"] },
    { amount: 12_345_678.9, currency: "JPY", through: ["EUR", "GBP", "JPY"] },
    { amount: 33.333333, currency: "CHF", through: ["LBP", "EUR", "CHF"] },
  ];

  for (const { amount, currency, through } of CASES) {
    it(`keeps ${amount} ${currency} through ${through.join(" → ")}`, () => {
      load(fresh(through[0]));
      store().addWalletEntry({
        id: "principal",
        year: 2026,
        month: 8,
        date: "2026-08-05",
        amount,
        currency,
        source: "Salary",
        type: "personal",
        note: "",
      });

      for (const target of through) {
        display(target);
        renderEverything();
        // Between every hop, the rate moves. A conversion round trip that is
        // exact at one rate is not exact across two.
        refresh({ USD: 1.0873 + Math.random() * 0.3, CHF: 0.9407 + Math.random() * 0.2 });
        renderEverything();
      }

      const entry = principals(snapshotNow())[0];
      // Exactly equal, not close: the principal is not an approximation.
      expect(entry.amount).toBe(amount);
      expect(entry.currency).toBe(currency);
    });
  }
});

// ─── §2.5 and §2.6 Repeated rate changes, and long loops ─────────────────────

describe("repeated rate changes and refresh loops", () => {
  it("moves no stored amount over forty rate changes and display switches", () => {
    load(fresh("EUR"));
    for (const [index, [amount, currency]] of ([
      [200, "USD"],
      [149.99, "EUR"],
      [1_500_000, "LBP"],
      [10, "GBP"],
      [100, "CHF"],
      [7_500, "JPY"],
    ] as const).entries()) {
      store().addWalletEntry({
        id: `entry-${index}`,
        year: 2026,
        month: 8,
        date: "2026-08-05",
        amount,
        currency,
        source: "Salary",
        type: index % 2 === 0 ? "personal" : "budget",
        note: "",
      });
    }

    const before = principals(snapshotNow());
    const currencies: CurrencyCode[] = ["EUR", "USD", "CHF", "GBP", "LBP", "JPY"];
    // The brief's rate ladder, and then some: 0.85, 0.90, 0.82, 1.01 of a
    // dollar per euro and every display currency in rotation.
    const ladder = [0.85, 0.9, 0.82, 1.01, 1.1609, 0.9902, 1.2214, 0.7734];

    for (let round = 0; round < 40; round += 1) {
      refresh({ USD: ladder[round % ladder.length] });
      renderEverything();
      display(currencies[round % currencies.length]);
      renderEverything();
      // A hydration in the middle of it all, which is where the brief says a
      // cumulative error would show.
      if (round % 7 === 0) {
        store().importSnapshot(JSON.parse(JSON.stringify(snapshotNow())));
        renderEverything();
      }
    }

    expect(principals(snapshotNow())).toEqual(before);
  });

  it("survives a rate provider that fails, and one that answers with nothing", () => {
    load(fresh("EUR"));
    store().addWalletEntry({
      id: "principal", year: 2026, month: 8, date: "2026-08-05",
      amount: 200, currency: "USD", source: "Salary", type: "personal", note: "",
    });
    const before = principals(snapshotNow());

    // A failed refresh leaves the old table standing.
    renderEverything();
    display("USD");
    // An empty table: nothing can be converted at all, and `rateToBase` falls
    // back to 1:1 to keep the interface rendering. That fallback is the most
    // dangerous moment there is for a principal, because every conversion
    // silently becomes the identity and a round trip *looks* correct.
    store().updateSettings({
      exchangeRates: { eurUsd: 0, usdLbp: 0, customToBase: {}, perEur: {} } as ExchangeRates,
    });
    renderEverything();
    display("EUR");
    renderEverything();
    refresh();
    renderEverything();

    expect(principals(snapshotNow())).toEqual(before);
  });
});

// ─── The defect this suite was written for ───────────────────────────────────

describe("an entry that cancels another is denominated the way it is", () => {
  it("keeps a reset wallet at zero at every future rate", () => {
    /*
     * The live defect. A wallet holding an allocation of 200 USD, displayed in
     * euros, reset to empty — and then the rate provider answers.
     *
     * Before the fix this reported budget money of €18.06 at 1.05, €49.81 at
     * 0.90 and −€18.57 at 1.30, in a wallet the reader had just cleared, with
     * every stored principal untouched and every existing test passing.
     */
    load(fresh("EUR"));
    store().allocateBudget({ amount: 200, currency: "USD", date: "2026-08-10", note: "", source: "" });
    expect(walletState(snapshotNow()).budgetRemaining).toBeGreaterThan(0);

    store().resetWallet();
    const settled = walletState(snapshotNow());
    expect(settled.walletBalance).toBeCloseTo(0, 6);
    expect(settled.budgetRemaining).toBeCloseTo(0, 6);
    expect(settled.personalBalance).toBeCloseTo(0, 6);

    for (const usd of [1.05, 0.9, 1.3, 0.6, 2.4]) {
      refresh({ USD: usd });
      const after = walletState(snapshotNow());
      expect(Math.abs(after.walletBalance), `wallet at ${usd}`).toBeLessThan(0.005);
      expect(Math.abs(after.budgetRemaining), `budget at ${usd}`).toBeLessThan(0.005);
      expect(Math.abs(after.personalBalance), `personal at ${usd}`).toBeLessThan(0.005);
    }
  });

  it("keeps a swept budget claim at zero at every future rate", () => {
    // The same defect on the other path: "move the leftover to personal".
    load(fresh("EUR"));
    store().allocateBudget({ amount: 600, currency: "USD", date: "2026-08-01", note: "", source: "" });
    store().allocateBudget({ amount: 250, currency: "CHF", date: "2026-08-02", note: "", source: "" });

    store().sweepBudgetToPersonal();
    expect(walletState(snapshotNow()).budgetRemaining).toBeCloseTo(0, 6);

    for (const [usd, chf] of [[1.05, 1.2], [0.9, 0.7], [1.3, 0.95]]) {
      refresh({ USD: usd, CHF: chf });
      const after = walletState(snapshotNow());
      expect(Math.abs(after.budgetRemaining), `budget at ${usd}/${chf}`).toBeLessThan(0.005);
      // And the sweep moved nothing: the same money, in the other pocket.
      expect(after.personalBalance).toBeCloseTo(after.walletBalance, 6);
    }
  });

  it("releases the claim in the currencies the claim is held in", () => {
    load(fresh("EUR"));
    store().allocateBudget({ amount: 600, currency: "USD", date: "2026-08-01", note: "", source: "" });
    store().allocateBudget({ amount: 250, currency: "CHF", date: "2026-08-02", note: "", source: "" });
    store().sweepBudgetToPersonal();

    const transfers = Object.values(snapshotNow().years)
      .flatMap((record) => record.walletEntries)
      .filter((entry) => entry.type === "transfer");
    // Two entries, in dollars and francs — not one entry in euros.
    expect(transfers.map((entry) => entry.currency).sort()).toEqual(["CHF", "USD"]);
    expect(transfers.find((entry) => entry.currency === "USD")?.amount).toBeCloseTo(600, 6);
    expect(transfers.find((entry) => entry.currency === "CHF")?.amount).toBeCloseTo(250, 6);
  });
});

// ─── §2.7 One fact, read by everything ───────────────────────────────────────

describe("every view reads the same principal", () => {
  it("agrees across the wallet, the composition and the statistics", () => {
    load(fresh("EUR"));
    store().addWalletEntry({
      id: "usd", year: 2026, month: 8, date: "2026-08-05",
      amount: 200, currency: "USD", source: "Salary", type: "personal", note: "",
    });
    store().addWalletEntry({
      id: "lbp", year: 2026, month: 8, date: "2026-08-06",
      amount: 1_500_000, currency: "LBP", source: "Cash", type: "personal", note: "",
    });

    for (const base of ["EUR", "USD", "LBP", "GBP"] as CurrencyCode[]) {
      display(base);
      const snapshot = snapshotNow();
      const slices = walletComposition(snapshot);
      // The composition reports the money as it is held, whatever is on the
      // screen: two currencies, at their own amounts, in every display.
      expect(slices.map((slice) => slice.currency).sort()).toEqual(["LBP", "USD"]);
      expect(slices.find((slice) => slice.currency === "USD")?.amount, base).toBe(200);
      expect(slices.find((slice) => slice.currency === "LBP")?.amount, base).toBe(1_500_000);

      // And the headline balance is those same two amounts, converted once.
      const converted = slices.reduce((total, slice) => total + slice.converted, 0);
      expect(walletState(snapshot).walletBalance).toBeCloseTo(converted, 6);
    }
  });
});

// ─── §2.8 Only the reader changes the reader's money ─────────────────────────

describe("changing the display currency is not changing the money", () => {
  it("needs an explicit edit to move an entry onto another currency", () => {
    load(fresh("EUR"));
    store().addWalletEntry({
      id: "principal", year: 2026, month: 8, date: "2026-08-05",
      amount: 200, currency: "USD", source: "Salary", type: "personal", note: "",
    });

    for (const base of ["CHF", "GBP", "LBP", "JPY", "EUR"] as CurrencyCode[]) display(base);
    expect(principals(snapshotNow())[0]).toEqual({ id: "principal", amount: 200, currency: "USD" });

    // Editing something else about the entry leaves the money alone.
    store().updateWalletEntry("principal", { note: "August" });
    expect(principals(snapshotNow())[0]).toEqual({ id: "principal", amount: 200, currency: "USD" });

    // And an explicit edit is allowed to change it, because that is the reader
    // saying so rather than the renderer.
    store().updateWalletEntry("principal", { amount: 170, currency: "EUR" });
    expect(principals(snapshotNow())[0]).toEqual({ id: "principal", amount: 170, currency: "EUR" });
  });
});

// ─── §2.9 Making it hard to reintroduce ──────────────────────────────────────

describe("the store cannot write a display currency onto money", () => {
  it("builds every ledger movement through one seam", async () => {
    /*
     * The structural half of §2.9, and it reads the source because that is
     * where the property lives: an object literal with a `currency:` line in
     * it is a second place the rule has to be remembered, and the rule was
     * forgotten in two of the five that existed.
     *
     * A `WalletEntry` is now built by `movement()`, which takes an amount and
     * a currency together in one argument. This asserts that nothing else
     * builds one — so a future writer with a converted figure and no currency
     * to name has nothing to pass.
     */
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../src/store/budgetStore.ts", import.meta.url), "utf8"),
    );
    // Comments stripped, because a comment explaining the rule sits between
    // several of these calls and their argument.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    // Wherever the ledger is appended to, the value must come from `movement(`.
    const pushes = [...source.matchAll(/walletEntries\.push\(\s*([\s\S]{0,16})/g)].map((match) => match[1]);
    expect(pushes.length).toBeGreaterThan(3);
    for (const push of pushes) {
      expect(push.trimStart().startsWith("movement("), `walletEntries.push(${push.slice(0, 16)}…)`).toBe(true);
    }

    /*
     * And the display currency is stamped onto money in exactly one place.
     *
     * Not zero, and the exception is the point of the check rather than a hole
     * in it. The month-end rollover records a figure the reader was shown and
     * confirmed — `monthlyBudget − spent`, already in the display currency —
     * so the display currency *is* its denomination; converting it into
     * something else before storing it would be the round trip §2.2 forbids.
     * Every other write takes its currency from the money it is about.
     *
     * An allowlist with the reason in it, which is the same shape this
     * repository already uses for the English-string scanner: the rule is
     * enforced, and the one deliberate exception has to be argued for in
     * writing before it can pass.
     */
    const stamped = [...source.matchAll(/currency: [a-zA-Z]+\.settings\.baseCurrency/g)];
    expect(stamped).toHaveLength(1);
    // And it is the rollover, not something that has quietly moved in beside
    // it: the allowed site is named, not merely counted.
    const around = source.slice(Math.max(0, (stamped[0].index ?? 0) - 260), (stamped[0].index ?? 0) + 260);
    expect(around).toContain("wallet-rollover");
  });
});
