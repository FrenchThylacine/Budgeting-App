import React from "react";
import { formatMoney, secondaryAmount } from "../../domain/currency";
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
 * An amount, in the currency it was recorded in, with its equivalent underneath.
 *
 * The **original stays the primary value**. A transaction of 150 000 LBP is a
 * transaction of 150 000 LBP; showing €1.35 in its place would be replacing
 * what happened with an interpretation of it that changes every time the rate
 * moves. The equivalent is a second, smaller line, and it is prefixed "≈"
 * because it is one.
 *
 * The second line is absent whenever it would be a guess — no second currency
 * configured, the amount already in it, or no rate connecting the pair. See
 * `secondaryAmount`: a fabricated equivalent under a real figure is worse than
 * no equivalent, because it reads exactly like a fact.
 */
export const Money: React.FC<MoneyProps> = ({ amount, currency, strong = false, className = "" }) => {
  const { t } = useTranslation();
  const settings = useBudgetStore((state) => state.snapshot.settings);
  const secondary = secondaryAmount(amount, currency, settings);
  const primary = formatMoney(amount, currency, settings.currencyDisplayMode);

  if (!secondary) {
    return strong ? <strong className={className}>{primary}</strong> : <span className={className}>{primary}</span>;
  }

  return (
    <span className={`money-pair ${className}`.trim()}>
      {strong ? <strong>{primary}</strong> : <span>{primary}</span>}
      <span className="money-secondary">
        {/* The symbol is decorative; assistive technology reads the word. */}
        <span aria-hidden="true">≈ </span>
        <span className="sr-only">{t("common.approximately")} </span>
        {formatMoney(secondary.amount, secondary.currency, settings.currencyDisplayMode)}
      </span>
    </span>
  );
};
