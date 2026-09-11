import React from "react";
import { displayEquivalent, formatMoney, secondaryEquivalent } from "../../domain/currency";
import { useBudgetStore } from "../../store/budgetStore";
import { useTranslation } from "../../i18n/useTranslation";
import type { CurrencyCode } from "../../domain/types";

interface MoneyProps {
  amount: number | null | undefined;
  currency: CurrencyCode;
  /** Renders the primary figure in bold. Off for running text. */
  strong?: boolean;
  className?: string;
}

/**
 * The "≈" line, shared by the two components below.
 *
 * The symbol is decorative and hidden from assistive technology, which reads
 * the word instead — "approximately 1.35 euros" rather than "tilde".
 */
const Approximately: React.FC<{ amount: number; currency: CurrencyCode }> = ({ amount, currency }) => {
  const { t } = useTranslation();
  const mode = useBudgetStore((state) => state.snapshot.settings.currencyDisplayMode);
  return (
    <span className="money-secondary">
      <span aria-hidden="true">≈ </span>
      <span className="sr-only">{t("common.approximately")} </span>
      {formatMoney(amount, currency, mode)}
    </span>
  );
};

/**
 * A **recorded** amount, in the currency it was recorded in, with its
 * equivalent in the display currency underneath.
 *
 * The original stays the primary value. A transaction of 150 000 LBP *is* a
 * transaction of 150 000 LBP; showing €1.35 in its place would replace what
 * happened with an interpretation of it that changes every time the rate
 * moves.
 *
 * The second line is the **display currency** — the one every total on the
 * screen is already in, and the only one that makes a foreign figure placeable
 * at a glance. It used to be the optional *second* currency, which meant a
 * Lebanese taxi in a euro budget printed "≈ $1.47": a currency the reader
 * never asked about for this figure, and one no total beside it was in. See
 * `displayEquivalent`.
 *
 * Absent whenever it would be a guess — already in the display currency, or no
 * rate connecting the pair. A fabricated equivalent under a real figure is
 * worse than no equivalent, because it reads exactly like a fact.
 */
export const Money: React.FC<MoneyProps> = ({ amount, currency, strong = false, className = "" }) => {
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const secondary = displayEquivalent(amount, currency, settings);
  const primary = formatMoney(amount, currency, settings.currencyDisplayMode);

  if (!secondary) {
    return strong ? <strong className={className}>{primary}</strong> : <span className={className}>{primary}</span>;
  }

  return (
    <span className={`money-pair ${className}`.trim()}>
      {strong ? <strong>{primary}</strong> : <span>{primary}</span>}
      <Approximately amount={secondary.amount} currency={secondary.currency} />
    </span>
  );
};

/**
 * An **aggregate**, with its equivalent in the optional second currency.
 *
 * A wallet balance, a month's activity cost, a period's spending — the figures
 * somebody who earns in one currency and budgets in another wants to read
 * twice. Off until a second currency is chosen, which is why this is the
 * *preference* half of the pair and `Money` is not.
 *
 * The amount is expected to be in the display currency already: aggregates are
 * normalised before they are summed, because adding dollars to euros is the
 * one thing this application must never do silently.
 */
export const Total: React.FC<{
  amount: number | null | undefined;
  /** Defaults to the display currency, which is what an aggregate is in. */
  currency?: CurrencyCode;
  className?: string;
  children?: React.ReactNode;
}> = ({ amount, currency, className = "", children }) => {
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const from = currency ?? settings.baseCurrency;
  // Nothing to say about zero. "€0.00 ≈ $0.00" is true and is noise.
  const secondary = amount ? secondaryEquivalent(amount, from, settings) : null;
  const primary = children ?? formatMoney(amount, from, settings.currencyDisplayMode);

  if (!secondary) return <span className={className}>{primary}</span>;

  return (
    <span className={`money-pair ${className}`.trim()}>
      <span>{primary}</span>
      <Approximately amount={secondary.amount} currency={secondary.currency} />
    </span>
  );
};
