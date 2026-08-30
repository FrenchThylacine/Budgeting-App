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
 *   **a word**  — in the badge and the chip, and in the tooltip and the
 *                 accessible name everywhere else.
 */

interface FundingMarkProps {
  kind: FundingKind;
  /**
   * `badge` — glyph and short label, for a row that is already dense.
   *
   * `chip` — glyph, a figure of the caller's choosing, then the label. For a
   * summary, where the amount is the point and the kind qualifies it.
   *
   * `glyph` — the mark alone, for a legend or a table cell that has its own
   * heading. The word stays in the accessible name.
   */
  variant?: "badge" | "chip" | "glyph";
  /** Extra detail after the label — who pays, when that is recorded. */
  detail?: string;
  /** The figure, for the `chip` variant. */
  children?: React.ReactNode;
  className?: string;
}

export const FundingMark: React.FC<FundingMarkProps> = ({
  kind,
  variant = "badge",
  detail,
  children,
  className = "",
}) => {
  const { t } = useTranslation();
  const label = t(`funding.${kind}.short`);
  const hint = t(`funding.${kind}.hint`);
  const glyph = FUNDING_META[kind].glyph;

  if (variant === "chip") {
    return (
      <span className={`funding-chip ${className}`.trim()} data-funding={kind} title={hint}>
        <span className="funding-glyph" aria-hidden="true">
          {glyph}
        </span>
        {children}
        <span className="funding-chip-label">{label}</span>
      </span>
    );
  }

  if (variant === "glyph") {
    return (
      <span className={`funding-glyph ${className}`.trim()} data-funding={kind} title={hint}>
        <span aria-hidden="true">{glyph}</span>
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    <span className={`funding-badge ${className}`.trim()} data-funding={kind} title={hint}>
      <span aria-hidden="true">{glyph}</span>
      {label}
      {detail ? ` · ${detail}` : ""}
    </span>
  );
};
