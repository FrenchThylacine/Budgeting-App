/**
 * The wallet: real money, as distinct from planned money
 * ======================================================
 *
 * The application has always had two different questions tangled into one
 * word, "remaining":
 *
 *   **Planning** — "how much budget should I *plan* to have this month?"
 *                  Answered by the activities and their real payment schedule,
 *                  rounded up to the next hundred. See `monthlyBudgetPlan`.
 *
 *   **Treasury** — "how much money do I actually *have*, and where did it go?"
 *                  Answered by this module, from a ledger of real movements.
 *
 * They are not the same number and they are not meant to converge. A user can
 * legitimately hold €900 while €500 of it is this month's budget and €400 is
 * their own — with the planning system still saying the month needs €600.
 *
 * Three balances, and each is derived, never stored:
 *
 *     wallet balance   = every ledger movement, minus budget spending
 *     budget remaining = allocations, minus budget spending, minus transfers out
 *     personal balance = wallet balance − budget remaining
 *
 * The third being a subtraction is the point: the wallet holds one pile of
 * money, and "personal" is simply the part of it that is not spoken for.
 *
 * ── Two rules that keep this honest ────────────────────────────────────────
 *
 * **The ledger has a start.** A budget written years before anyone opened this
 * tab has thousands of recorded transactions; charging all of them against a
 * €600 allocation made today would report a wildly negative wallet. Spending
 * only affects the treasury from the **epoch** — the date of the first ledger
 * entry, which is exactly what an opening balance means. Before that date the
 * app makes no claim about how much cash existed.
 *
 * **Time does not spend money.** A month ending does not consume, reset or
 * delete allocated funds; only a payment or a deliberate transfer does. The
 * ledger therefore crosses calendar months and years without a rollover step,
 * which is why `createNextYearRecord` no longer manufactures an opening entry:
 * under a continuous ledger, that would have counted the balance twice.
 */
import { normalizeAmount } from "./currency";
import { activityMonthCost } from "./activityBudget";
import { monthName } from "./dates";
import { activityFundingKind, isPersonallyFunded } from "./funding";
import { storedText } from "./storedText";
import type {
  BudgetSnapshot,
  CurrencyCode,
  SpendingEntry,
  WalletEntry,
  WalletEntryType,
} from "./types";

/** Which way money moved. Derived from the sign, never stored twice. */
export type WalletDirection = "in" | "out";

/**
 * What a ledger entry is.
 *
 * `budget` is a **budget allocation**: money actually received for the month's
 * budget. `transfer` moves already-present money from the budget pile to the
 * personal one — it changes nothing about how much cash exists, which is why
 * its wallet effect is zero and only its budget effect is not.
 */
export const ALLOCATION_TYPE: WalletEntryType = "budget";
export const TRANSFER_TYPE: WalletEntryType = "transfer";

/** How much a ledger entry changes the amount of cash held. */
export function walletEffect(entry: Pick<WalletEntry, "type" | "amount">): number {
  // A budget→personal transfer is an internal reclassification. Treating it as
  // an inflow or an outflow would make the total cash jump for a move that
  // did not involve any money leaving or arriving.
  if (entry.type === TRANSFER_TYPE) return 0;
  return entry.amount;
}

/** How much a ledger entry changes the allocated budget still available. */
export function budgetEffect(entry: Pick<WalletEntry, "type" | "amount">): number {
  if (entry.type === ALLOCATION_TYPE) return entry.amount;
  if (entry.type === TRANSFER_TYPE) return -entry.amount;
  return 0;
}

/**
 * The date a ledger entry belongs to.
 *
 * `date` where the entry has one; otherwise the first of its year and month,
 * which is what every entry written before the field existed can honestly
 * claim. Never `createdAt`: when a movement was *typed in* is not when the
 * money moved.
 */
export function walletEntryDate(entry: Pick<WalletEntry, "date" | "year" | "month">): string {
  if (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return entry.date;
  const month = String(Math.min(Math.max(entry.month || 1, 1), 12)).padStart(2, "0");
  return `${entry.year}-${month}-01`;
}

/** Every ledger entry in the budget, across all years, oldest first. */
export function allWalletEntries(snapshot: BudgetSnapshot): WalletEntry[] {
  return Object.values(snapshot.years)
    .flatMap((record) => record.walletEntries ?? [])
    .sort((a, b) => walletEntryDate(a).localeCompare(walletEntryDate(b)) || (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * The date the treasury starts.
 *
 * Null when there is no ledger at all, in which case the wallet is empty and
 * no spending is charged to it — "the wallet starts at zero" is a real state,
 * not a balance of minus everything the user has ever spent.
 */
export function ledgerEpoch(snapshot: BudgetSnapshot): string | null {
  const entries = allWalletEntries(snapshot);
  return entries.length > 0 ? walletEntryDate(entries[0]) : null;
}

/**
 * Spending that comes out of the wallet.
 *
 * Only **paid by me — in budget**. Money somebody else paid never entered this
 * wallet, and money the user deliberately keeps outside this budget is by
 * definition not tracked here — see `domain/funding.ts`. Both remain fully
 * visible in the spending record; neither touches the treasury.
 */
export function walletSpending(snapshot: BudgetSnapshot, epoch: string | null): SpendingEntry[] {
  if (!epoch) return [];
  return Object.values(snapshot.years)
    .flatMap((record) => record.spendingEntries ?? [])
    .filter(isPersonallyFunded)
    .filter((entry) => (entry.date ?? "").slice(0, 10) >= epoch)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WalletMovement {
  id: string;
  /** YYYY-MM-DD. */
  date: string;
  label: string;
  note: string;
  direction: WalletDirection;
  /** Always positive, in the display currency. */
  amountBase: number;
  /** As recorded, in the currency it was recorded in. */
  amountNative: number;
  currency: CurrencyCode;
  kind: WalletEntryType | "spending";
  /** Signed effect on the cash held, in the display currency. */
  walletDelta: number;
  /** Signed effect on the allocated budget, in the display currency. */
  budgetDelta: number;
  /** Set when the movement is a spending transaction rather than a ledger row. */
  spendingId?: string;
}

export interface WalletState {
  /** Actual money held. The headline figure. */
  walletBalance: number;
  /** Allocated budget money still available, carried across months. */
  budgetRemaining: number;
  /** Money outside the current budget: `walletBalance − budgetRemaining`. */
  personalBalance: number;
  /** Everything ever allocated, since the epoch. */
  allocatedTotal: number;
  /** Budget spending charged against it. */
  budgetSpent: number;
  /** Budget money deliberately moved to the personal side. */
  transferredToPersonal: number;
  /** Money in and money out, for the two summary figures. */
  moneyIn: number;
  moneyOut: number;
  /** Every movement, newest first. */
  movements: WalletMovement[];
  /** When the ledger begins, or null when there is none. */
  epoch: string | null;
}


/**
 * What the wallet is actually made of, currency by currency
 * =========================================================
 *
 * `walletBalance` is a single figure in the display currency, which is what a
 * total has to be — but it is not what the money *is*. Somebody holding 200 USD
 * and €200 has two balances, and converting both into one number and printing
 * it is the point at which the application stops being able to answer "how many
 * dollars do I have".
 *
 * So this reports the balances **in their own currencies**, untouched, and
 * carries a converted figure alongside purely so the shares can be compared.
 * The two are separate fields on purpose: the original amount is the fact, and
 * the conversion is a lens. Nothing here writes back to a stored amount, and
 * nothing rounds one — a share is derived from the conversion, never the other
 * way round.
 *
 * Used by the Wallet tab, the Dashboard and the statistics, so all three agree
 * by construction rather than by three people remembering the same rule.
 */
export interface WalletCurrencySlice {
  currency: CurrencyCode;
  /** The balance in that currency, exactly as it is held. Never converted. */
  amount: number;
  /** The same balance in the display currency, for comparison only. */
  converted: number;
  /** Its share of the converted total, 0–100, or null when the total is zero. */
  share: number | null;
}

export function walletComposition(snapshot: BudgetSnapshot): WalletCurrencySlice[] {
  const entries = allWalletEntries(snapshot);
  const byCurrency = new Map<CurrencyCode, number>();

  for (const entry of entries) {
    const effect = walletEffect(entry);
    if (effect === 0) continue;
    // Accumulated in the entry's own currency: this is the number the reader
    // put in, and it stays that number.
    byCurrency.set(entry.currency, (byCurrency.get(entry.currency) ?? 0) + effect);
  }

  const slices = [...byCurrency.entries()]
    .map(([currency, amount]) => ({
      currency,
      amount,
      converted: normalizeAmount(amount, currency, snapshot.settings),
      share: null as number | null,
    }))
    // A currency whose balance has netted to nothing is not part of the
    // composition; it is a currency the reader used to hold.
    .filter((slice) => Math.abs(slice.amount) > 0.005);

  const total = slices.reduce((sum, slice) => sum + Math.abs(slice.converted), 0);
  for (const slice of slices) {
    slice.share = total > 0 ? (Math.abs(slice.converted) / total) * 100 : null;
  }

  // Largest first: the composition is read as "mostly euros, some dollars".
  return slices.sort((a, b) => Math.abs(b.converted) - Math.abs(a.converted));
}

/**
 * The whole treasury, derived from the ledger and the spending record.
 *
 * Nothing here is stored. A balance that is written down is a balance that can
 * disagree with the movements that produced it, and the first thing anybody
 * does with a disagreement is trust the wrong one.
 */
export function walletState(snapshot: BudgetSnapshot): WalletState {
  const epoch = ledgerEpoch(snapshot);
  const entries = allWalletEntries(snapshot);
  const spending = walletSpending(snapshot, epoch);

  const base = (amount: number, currency: CurrencyCode) => normalizeAmount(amount, currency, snapshot.settings);

  const movements: WalletMovement[] = [];

  let walletBalance = 0;
  let budgetRemaining = 0;
  let allocatedTotal = 0;
  let transferredToPersonal = 0;
  let moneyIn = 0;
  let moneyOut = 0;

  for (const entry of entries) {
    const walletDelta = base(walletEffect(entry), entry.currency);
    const budgetDelta = base(budgetEffect(entry), entry.currency);
    walletBalance += walletDelta;
    budgetRemaining += budgetDelta;
    if (entry.type === ALLOCATION_TYPE) allocatedTotal += base(entry.amount, entry.currency);
    if (entry.type === TRANSFER_TYPE) transferredToPersonal += base(entry.amount, entry.currency);
    if (walletDelta > 0) moneyIn += walletDelta;
    if (walletDelta < 0) moneyOut += -walletDelta;

    movements.push({
      id: entry.id,
      date: walletEntryDate(entry),
      label: entry.source,
      note: entry.note ?? "",
      // A transfer moves nothing in or out, so it is neither; it is shown as
      // an inflow to the personal side because that is what it does.
      direction: entry.type === TRANSFER_TYPE ? "in" : entry.amount >= 0 ? "in" : "out",
      amountBase: Math.abs(base(entry.amount, entry.currency)),
      amountNative: Math.abs(entry.amount),
      currency: entry.currency,
      kind: entry.type,
      walletDelta,
      budgetDelta,
    });
  }

  for (const entry of spending) {
    const amount = base(entry.amount, entry.currency);
    walletBalance -= amount;
    budgetRemaining -= amount;
    moneyOut += amount;
    movements.push({
      id: `spend-${entry.id}`,
      date: entry.date,
      /*
       * The note *is* the label for a transaction, so it must not also be the
       * note — every ledger row read "Train tickets / 22 Aug · Train tickets".
       * A row with no note keeps a stored key rather than an English word, so
       * it reads in whatever language it is looked at in.
       */
      label: entry.note?.trim() || storedText("wallet.spendingMovement"),
      note: "",
      direction: "out",
      amountBase: Math.abs(amount),
      amountNative: Math.abs(entry.amount),
      currency: entry.currency,
      kind: "spending",
      walletDelta: -amount,
      budgetDelta: -amount,
      spendingId: entry.id,
    });
  }

  movements.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  return {
    walletBalance,
    budgetRemaining,
    // Derived, so the three figures can never disagree about the same pile of
    // money. It can be negative, and that is a real state: it means budget
    // money has been spent on things this ledger never received cash for.
    personalBalance: walletBalance - budgetRemaining,
    allocatedTotal,
    budgetSpent: spending.reduce((total, entry) => total + base(entry.amount, entry.currency), 0),
    transferredToPersonal,
    moneyIn,
    moneyOut,
    movements,
    epoch,
  };
}

// ─── Budget allocations, month by month ──────────────────────────────────────

export interface BudgetPeriod {
  year: number;
  month: number;
  label: string;
  /** Budget money still available when the month began. */
  carriedIn: number;
  /** Allocated during the month. */
  allocated: number;
  /** Budget spending during the month. */
  spent: number;
  /** Moved to the personal side during the month. */
  transferred: number;
  /** Still available at the end of the month: it does not expire. */
  remaining: number;
}

/**
 * The allocation history, one row per month that saw any budget activity.
 *
 * `carriedIn` is what makes the point: September's budget starts with whatever
 * August did not spend, because a month ending is not an event that consumes
 * money. Months with nothing in them are omitted rather than padded with
 * zeroes — a table of empty months is not history.
 */
export function budgetPeriods(snapshot: BudgetSnapshot): BudgetPeriod[] {
  const epoch = ledgerEpoch(snapshot);
  const base = (amount: number, currency: CurrencyCode) => normalizeAmount(amount, currency, snapshot.settings);

  const buckets = new Map<string, { year: number; month: number; allocated: number; spent: number; transferred: number }>();
  const bucket = (date: string) => {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const key = `${year}-${String(month).padStart(2, "0")}`;
    let found = buckets.get(key);
    if (!found) {
      found = { year, month, allocated: 0, spent: 0, transferred: 0 };
      buckets.set(key, found);
    }
    return found;
  };

  for (const entry of allWalletEntries(snapshot)) {
    if (entry.type !== ALLOCATION_TYPE && entry.type !== TRANSFER_TYPE) continue;
    const target = bucket(walletEntryDate(entry));
    if (entry.type === ALLOCATION_TYPE) target.allocated += base(entry.amount, entry.currency);
    else target.transferred += base(entry.amount, entry.currency);
  }

  for (const entry of walletSpending(snapshot, epoch)) {
    bucket(entry.date).spent += base(entry.amount, entry.currency);
  }

  let running = 0;
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => {
      const carriedIn = running;
      const remaining = carriedIn + value.allocated - value.spent - value.transferred;
      running = remaining;
      return {
        year: value.year,
        month: value.month,
        label: `${monthName(value.month)} ${value.year}`,
        carriedIn,
        allocated: value.allocated,
        spent: value.spent,
        transferred: value.transferred,
        remaining,
      };
    })
    .reverse();
}

// ─── The planning half ───────────────────────────────────────────────────────

export interface MonthlyBudgetPlan {
  year: number;
  month: number;
  /** What the month's activities genuinely require, in the display currency. */
  requirement: number;
  /** The requirement rounded **up to the next hundred**. */
  suggested: number;
  /** Activities whose payment month is unknown, and their monthly accrual. */
  unscheduledCount: number;
  unscheduledMonthly: number;
}

/**
 * What this month should be budgeted at.
 *
 * The planning value, and deliberately not a wallet figure: it says what the
 * user *needs*, never what they have. The wallet offers it as the amount to
 * allocate, and the user records the allocation when the money genuinely
 * arrives — the app does not assume it did because it calculated that it
 * should.
 *
 * The requirement is what actually falls due in this month, from real payment
 * dates, so an annual subscription lands in one month rather than a twelfth in
 * each. Rounding is up to the next hundred, which leaves 1,000 at 1,000 —
 * `Math.ceil` of an exact hundred is that hundred.
 */
export function monthlyBudgetPlan(
  snapshot: BudgetSnapshot,
  year: number = snapshot.settings.selectedYear,
  month: number = snapshot.settings.selectedMonth,
): MonthlyBudgetPlan {
  const record = snapshot.years[String(year)];

  const relevant = (record?.activities ?? []).filter((activity) => {
    if (!activity.active || !activity.visible) return false;
    // Only money this budget has to find: an activity somebody else pays for,
    // or one kept outside the budget, needs none of it. Nothing else excludes
    // an activity — a category no longer decides whether its activities count,
    // which is what the old "include piloting" setting did for exactly one
    // hard-coded category name.
    return activityFundingKind(activity) === "personal";
  });

  let requirement = 0;
  let unscheduledCount = 0;
  let unscheduledMonthly = 0;
  for (const activity of relevant) {
    const cost = activityMonthCost(activity, snapshot, year, month);
    if (cost.status === "unknown") {
      // Never folded into the requirement: that is the whole point of the
      // `unknown` state. Reported alongside so the figure can be read with the
      // caveat rather than in spite of it.
      unscheduledCount += 1;
      unscheduledMonthly += cost.monthlyBase;
      continue;
    }
    requirement += cost.dueBase ?? 0;
  }

  return {
    year,
    month,
    requirement,
    suggested: roundUpToHundred(requirement),
    unscheduledCount,
    unscheduledMonthly,
  };
}

/** 523 → 600, 601 → 700, 1000 → 1000, 0 → 0. */
export function roundUpToHundred(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / 100) * 100;
}

/**
 * Whether there is leftover budget worth asking the user about.
 *
 * Asked at the two natural moments — the end of a budget period, and just
 * before a new allocation — and never acted on without an answer. Leftover
 * budget is the user's money; it is not the app's to sweep away.
 */
export function leftoverBudget(snapshot: BudgetSnapshot): number {
  const remaining = walletState(snapshot).budgetRemaining;
  // Below a hundredth of a unit is below anything displayed, and prompting
  // about €0.004 is noise rather than diligence.
  return remaining > 0.005 ? remaining : 0;
}
