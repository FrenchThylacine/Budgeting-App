import type { Activity, SpendingEntry } from "./types";

/**
 * Who funded it
 * =============
 *
 * Three genuinely different facts, not two and a label:
 *
 *  1. **Paid by me — in budget.** Money out of this budget. It consumes the
 *     monthly budget, the remaining figure, the burn rate, the forecast, the
 *     category caps and the health score.
 *  2. **Paid by other.** Somebody else's money: a dinner a friend covered, a
 *     subscription a parent pays, lessons an employer funds. It happened, it
 *     has an amount, and it belongs in the record — but it is not this budget's
 *     money and never consumes it.
 *  3. **Outside budget.** The user's own money, deliberately kept out of this
 *     budget: another account, a business expense, a pot that is tracked
 *     elsewhere. Also never consumes the personal budget.
 *
 * 2 and 3 share one behaviour — neither touches the personal budget — and are
 * *not* the same thing. Collapsing them in statistics or a report answers "how
 * much did I not pay for" when the questions are "how much did somebody else
 * pay for me" and "how much of my own spending am I keeping off this budget".
 * Every breakdown therefore reports three figures.
 *
 *     Budget                €1,000
 *     Paid by me              €300
 *     Paid by other           €200
 *     Outside budget          €150
 *     Remaining               €700   ← not €500, and not €350
 *
 * This used to be a preference (`settings.ignoreNonBudgetSpending`, default
 * off), which meant the default behaviour charged the user for money somebody
 * else had spent. It is a rule about what the numbers mean, not a matter of
 * taste, so it is not optional and not expressible anywhere but here.
 *
 * Every selector that produces a personal-budget figure filters through
 * `personalEntries`. Anything that wants the full ledger — the transaction
 * list, the audit trail, a gross total — uses the entries unfiltered and says
 * so.
 */

/** The three funding classifications, as the rest of the app names them. */
export type FundingKind = "personal" | "other" | "outside";

export const FUNDING_KINDS: readonly FundingKind[] = ["personal", "other", "outside"];

/** The stored value meaning "this came out of my own budget". */
export const PERSONAL_SOURCE = "personal";

export interface FundingKindMeta {
  kind: FundingKind;
  /** The stored `source` value written for this kind. */
  value: string;
  /** Full label, used in editors, reports and legends. */
  label: string;
  /** Compact label for a badge or a narrow column. */
  shortLabel: string;
  /** What choosing this does to the budget, said plainly where it is chosen. */
  hint: string;
  /** Theme token used for the figure and the chart series. */
  color: string;
  /**
   * A non-colour mark, for print.
   *
   * A black-and-white report cannot rely on a swatch, so every funding figure
   * also carries a distinct glyph and a written label. See `domain/report.ts`.
   */
  glyph: string;
}

export const FUNDING_META: Record<FundingKind, FundingKindMeta> = {
  personal: {
    kind: "personal",
    value: "personal",
    label: "Paid by me — in budget",
    shortLabel: "Paid by me",
    hint: "Counts against your budget.",
    color: "var(--accent)",
    glyph: "●",
  },
  other: {
    kind: "other",
    value: "shared",
    label: "Paid by other",
    shortLabel: "Paid by other",
    hint: "Recorded in full. Somebody else's money, so it never touches your budget.",
    color: "var(--teal)",
    glyph: "◆",
  },
  outside: {
    kind: "outside",
    value: "external",
    label: "Outside budget",
    shortLabel: "Outside budget",
    hint: "Recorded in full. Your money, deliberately kept out of this budget.",
    color: "var(--warning)",
    glyph: "▲",
  },
};

export interface FundingSourceOption {
  value: string;
  kind: FundingKind;
  label: string;
  hint: string;
}

/** What the spending and activity editors offer, in a fixed order. */
export const FUNDING_SOURCES: readonly FundingSourceOption[] = FUNDING_KINDS.map((kind) => ({
  value: FUNDING_META[kind].value,
  kind,
  label: FUNDING_META[kind].label,
  hint: FUNDING_META[kind].hint,
}));

/**
 * The kind a stored `source` value means.
 *
 * A missing source is personal: that is what every entry written before
 * funding sources existed was. An unrecognised non-personal value — "gift",
 * "reimbursed", anything an old import wrote — is read as *paid by other*
 * rather than as outside-budget, because those words describe somebody else's
 * money and because "other" is the weaker claim of the two.
 */
export function fundingKind(source: string | null | undefined): FundingKind {
  const value = source ?? PERSONAL_SOURCE;
  if (value === "personal") return "personal";
  if (value === "external" || value === "outside") return "outside";
  return "other";
}

/** A missing source means personal. */
export function fundingSource(entry: Pick<SpendingEntry, "source">): string {
  return entry.source ?? PERSONAL_SOURCE;
}

/** The classification of one transaction. */
export function entryFundingKind(entry: Pick<SpendingEntry, "source">): FundingKind {
  return fundingKind(entry.source);
}

/**
 * The classification of one activity.
 *
 * Absent means personal, which is what every activity created before this
 * field existed behaved as: it counted toward the budget in full.
 */
export function activityFundingKind(activity: Pick<Activity, "fundingSource">): FundingKind {
  return fundingKind(activity.fundingSource);
}

/**
 * Who is named as paying, when the activity says.
 *
 * Only meaningful for *paid by other* — "Dad", "the club", "work". Empty and
 * absent are the same thing, and neither is ever required.
 */
export function fundedByName(activity: Pick<Activity, "fundingSource" | "fundedBy">): string | null {
  if (activityFundingKind(activity) !== "other") return null;
  const name = activity.fundedBy?.trim();
  return name ? name : null;
}

/** True when the transaction was paid out of the user's own budget. */
export function isPersonallyFunded(entry: Pick<SpendingEntry, "source">): boolean {
  return entryFundingKind(entry) === "personal";
}

/**
 * True when this budget did not pay: *paid by other* or *outside budget*.
 *
 * The one thing the two share. Anything that needs to tell them apart calls
 * `entryFundingKind` — this predicate deliberately cannot.
 */
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

/** Everything this budget did not pay for — both non-personal kinds together. */
export function externalEntries<T extends Pick<SpendingEntry, "source">>(entries: readonly T[]): T[] {
  return entries.filter(isExternallyFunded);
}

/** Entries somebody else paid for. */
export function otherFundedEntries<T extends Pick<SpendingEntry, "source">>(entries: readonly T[]): T[] {
  return entries.filter((entry) => entryFundingKind(entry) === "other");
}

/** Entries the user keeps outside this budget. */
export function outsideBudgetEntries<T extends Pick<SpendingEntry, "source">>(entries: readonly T[]): T[] {
  return entries.filter((entry) => entryFundingKind(entry) === "outside");
}

/** Split a list three ways, in one pass, keeping the three lists distinct. */
export function splitByFunding<T extends Pick<SpendingEntry, "source">>(
  entries: readonly T[],
): Record<FundingKind, T[]> {
  const buckets: Record<FundingKind, T[]> = { personal: [], other: [], outside: [] };
  for (const entry of entries) buckets[entryFundingKind(entry)].push(entry);
  return buckets;
}

/** Human label for a stored source value, for badges and reports. */
export function fundingLabel(source: string | null | undefined): string {
  return FUNDING_META[fundingKind(source)].label;
}

/** The compact form, for a badge or a narrow table column. */
export function fundingShortLabel(source: string | null | undefined): string {
  return FUNDING_META[fundingKind(source)].shortLabel;
}
