import type { SpendingEntry } from "./types";

/**
 * Who paid for a transaction
 * ==========================
 *
 * A transaction someone else paid for is a real transaction. It happened, it
 * has an amount, and it belongs in the record — a dinner a friend covered, a
 * purchase being reimbursed, a shared subscription billed to one card. What it
 * is *not* is money out of this budget.
 *
 * So the amount is never zeroed and the entry is never hidden. It is simply
 * excluded from every figure that answers "how am I doing against my budget":
 *
 *     Budget            €1,000
 *     Personal spend      €300
 *     Paid by others      €200
 *     Remaining           €700   ← not €500
 *
 * This used to be a preference (`settings.ignoreNonBudgetSpending`, default
 * off), which meant the default behaviour charged the user €500 against a
 * budget they had only spent €300 of, and the remaining budget, the burn rate,
 * the forecast and the health score were all wrong by the amount someone else
 * had paid. It is a rule about what the numbers mean, not a matter of taste, so
 * it is no longer optional and no longer expressible anywhere but here.
 *
 * Every selector that produces a personal-budget figure filters through
 * `personalEntries`. Anything that wants the full ledger — the transaction
 * list, the audit trail, a "total transactions" figure — uses the entries
 * unfiltered and says so.
 */

/** The stored value meaning "this came out of my own budget". */
export const PERSONAL_SOURCE = "personal";

export interface FundingSourceOption {
  value: string;
  label: string;
  /** What choosing this does to the budget, said plainly in the editor. */
  hint: string;
}

/**
 * What the spending editor offers.
 *
 * `external` and `shared` are kept as separate values because existing data
 * uses both and they read differently on a transaction ("outside my budget" vs
 * "someone else paid"). They behave identically: neither is personal.
 */
export const FUNDING_SOURCES: readonly FundingSourceOption[] = [
  { value: "personal", label: "My budget", hint: "Counts against your budget." },
  { value: "shared", label: "Someone else paid", hint: "Recorded in full, excluded from your budget." },
  { value: "external", label: "Outside my budget", hint: "Recorded in full, excluded from your budget." },
];

/** A missing source means personal: it is what every entry written before this existed was. */
export function fundingSource(entry: Pick<SpendingEntry, "source">): string {
  return entry.source ?? PERSONAL_SOURCE;
}

/** True when the transaction was paid out of the user's own budget. */
export function isPersonallyFunded(entry: Pick<SpendingEntry, "source">): boolean {
  return fundingSource(entry) === PERSONAL_SOURCE;
}

/** True when someone or something other than this budget paid. */
export function isExternallyFunded(entry: Pick<SpendingEntry, "source">): boolean {
  return !isPersonallyFunded(entry);
}

/**
 * The entries that count against the personal budget.
 *
 * Every budget, remaining, pacing, burn-rate, forecast, category, health,
 * comparison and report figure is derived from this list. Nothing else decides.
 */
export function personalEntries<T extends Pick<SpendingEntry, "source">>(entries: readonly T[]): T[] {
  return entries.filter(isPersonallyFunded);
}

/** The entries somebody else funded — shown alongside, never mixed in. */
export function externalEntries<T extends Pick<SpendingEntry, "source">>(entries: readonly T[]): T[] {
  return entries.filter(isExternallyFunded);
}

/** Human label for a stored source value, for badges and reports. */
export function fundingLabel(source: string | null | undefined): string {
  return FUNDING_SOURCES.find((option) => option.value === (source ?? PERSONAL_SOURCE))?.label ?? String(source);
}
