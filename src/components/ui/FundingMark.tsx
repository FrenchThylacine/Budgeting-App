import React from "react";
import { FUNDING_META, type FundingKind } from "../../domain/funding";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * Who paid, as a mark
 * ===================
 *
 * The three funding kinds already had one definition — `domain/funding.ts` —
 * and three renderings: a badge in the transaction list, the same badge in the
 * activity list, and a chip on the dashboard, each spelling out the glyph, the
 * `data-funding` attribute and the tooltip key by hand. Three copies of one
 * piece of vocabulary is how the vocabulary stops being one: the badge learns
 * a tooltip the chip never gets, and a reader meets the same fact in two
 * different shapes on two tabs.
 *
 * So this is `CadenceMark`'s counterpart, and it follows the same rule. Three
 * channels, never colour alone:
 *
 *   **a glyph** — ● ◆ ▲, distinct in silhouette so the distinction survives a
 *                 monochrome print and a colour-blind reader;
 *   **a tone**  — `data-funding` picks it up from the palette. Paid-by-me and
 *                 paid-by-other are two blues, because they are both *how an
 *                 activity is funded*; outside-budget is amber, because it is
 *                 the reader's own money held apart, which is a different kind
 *                 of fact;
 *   **a word**  — beside the figure, and in the tooltip.
 */

interface FundingMarkProps {
  kind: FundingKind;
  /** The figure the kind qualifies. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * One shape, because there is one place left that needs it.
 *
 * There were three — a badge, a bare glyph and this chip. The badge had no
 * callers at all, and the glyph's two were the activity and transaction cards,
 * where V5.1 removed it: the funding state is carried there by the colour of
 * the name and the figure, and a fourth mark on a card that already has an
 * outline, an entity mark and a schedule shape is one thing too many competing
 * to be noticed.
 *
 * The chip survives because a *summary* is the one place the colour cannot
 * carry it: a figure standing on its own beside two other figures has nothing
 * to be a different colour from.
 */
export const FundingMark: React.FC<FundingMarkProps> = ({ kind, children, className = "" }) => {
  const { t } = useTranslation();
  const label = t(`funding.${kind}.short`);

  return (
    <span className={`funding-chip ${className}`.trim()} data-funding={kind} title={t(`funding.${kind}.hint`)}>
      <span className="funding-glyph" aria-hidden="true">
        {FUNDING_META[kind].glyph}
      </span>
      {children}
      <span className="funding-chip-label">{label}</span>
    </span>
  );
};
