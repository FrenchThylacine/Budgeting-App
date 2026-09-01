import React from "react";
import { CADENCE_META, type Cadence } from "../../domain/cadence";
import type { FundingKind } from "../../domain/funding";
import { CadenceMark } from "./CadenceMark";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * A key to the marks on *this* screen, and no others
 * ==================================================
 *
 * The application asks a reader to learn two small visual languages — who paid,
 * and how often — and then never tells them what the shapes mean. The answer
 * the brief asks for is not a paragraph explaining the system: it is a legend
 * small enough to be ignored, listing only the symbols that are actually on the
 * screen it sits under.
 *
 * So this takes the marks *in the current data* rather than the whole
 * vocabulary. A month with no shared costs shows no funding glyph; a list of
 * one-off purchases shows no calendar. On a screen where everything is ordinary
 * it renders nothing at all, which is the case it has to get right — a legend
 * that is always there is a paragraph with bullet points.
 *
 * `personal` is never listed. It is the default state of every figure in the
 * application, it carries no badge on a row, and a key entry for "this is
 * normal" is the kind of completeness that makes a legend worth skipping.
 */

interface MarkLegendProps {
  /** The funding kinds present, in any order. `personal` is ignored. */
  funding?: readonly FundingKind[];
  /** The cadences present, in any order. */
  cadences?: readonly Cadence[];
  className?: string;
}

export const MarkLegend: React.FC<MarkLegendProps> = ({ funding = [], cadences = [], className = "" }) => {
  const { t } = useTranslation();

  const kinds = (["other", "outside"] as const).filter((kind) => funding.includes(kind));
  // In the vocabulary's own order rather than the order they were met in, so
  // the key reads the same way twice running.
  const shown = (Object.keys(CADENCE_META) as Cadence[]).filter((cadence) => cadences.includes(cadence));

  if (kinds.length === 0 && shown.length === 0) return null;

  return (
    <p className={`mark-legend ${className}`.trim()}>
      <span className="sr-only">{t("legend.title")}</span>
      {kinds.map((kind) => (
        /*
         * The word, in the colour it is describing, and no glyph.
         *
         * The cards it keys stopped carrying a funding glyph in V5.1 — the
         * name and the figure are set in the funding colour instead — so a
         * legend entry showing a diamond would be explaining a mark that is no
         * longer anywhere on the screen. "Paid by other", in blue, is both the
         * label and the example.
         */
        <span key={kind} className="mark-legend-item" data-funding={kind}>
          {t(`funding.${kind}.short`)}
        </span>
      ))}
      {shown.map((cadence) => (
        <span key={cadence} className="mark-legend-item">
          <CadenceMark cadence={cadence} labelled />
          {t(CADENCE_META[cadence].labelKey)}
        </span>
      ))}
    </p>
  );
};
