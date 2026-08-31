import React from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Dot,
  Layers,
  Repeat,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { CADENCE_META, type Cadence } from "../../domain/cadence";
import { useTranslation } from "../../i18n/useTranslation";

/**
 * The icon table, resolved from the names the domain module carries.
 *
 * The domain holds a *name* rather than a component so it stays free of React
 * and can be read by the report and the server; this is the one place that
 * turns a name into a shape.
 */
const ICONS: Record<string, LucideIcon> = {
  Repeat,
  CalendarClock,
  CalendarDays,
  CalendarCheck,
  Ticket,
  Layers,
  Dot,
};

interface CadenceMarkProps {
  cadence: Cadence;
  /**
   * `icon` is the shape alone, for a dense row: the word is still in the
   * accessible name and in the tooltip, so nothing is lost, but a list of
   * thirty rows does not repeat "Monthly" thirty times.
   *
   * `chip` shows the word beside it, for the places with room to teach the
   * vocabulary — an editor, a summary, a legend.
   */
  variant?: "icon" | "chip";
  /** Extra detail after the label — "every 10 sessions", "renews 15 Sept". */
  detail?: string;
  /**
   * A visible label already accompanies this mark, so it carries none itself.
   *
   * The `icon` variant hides its word in an `sr-only` span, which is right on a
   * dense row and wrong in a legend that prints the word beside it: a screen
   * reader then hears "Monthly Monthly".
   */
  labelled?: boolean;
  className?: string;
}

/**
 * How often this costs money, as a shape.
 *
 * Three channels every time, which is the whole point: the icon, a tone from
 * the small cadence palette, and the word — in the chip where there is room,
 * and in the accessible name and the tooltip where there is not. Colour is
 * never carrying it alone.
 *
 * This replaces a family of sentences that said the same thing differently on
 * every screen: "Monthly · every 1", "billed once a year", "fixed monthly",
 * "session pack", "0 sessions/month · active".
 */
export const CadenceMark: React.FC<CadenceMarkProps> = ({
  cadence,
  variant = "icon",
  detail,
  labelled = false,
  className = "",
}) => {
  const { t } = useTranslation();
  const meta = CADENCE_META[cadence];
  const Icon = ICONS[meta.icon] ?? Dot;
  const label = t(meta.labelKey);
  const full = detail ? `${label} · ${detail}` : label;

  if (variant === "chip") {
    return (
      <span className={`cadence-chip ${className}`.trim()} data-cadence={cadence} title={full}>
        <Icon size={13} aria-hidden="true" />
        <span>{label}</span>
        {detail && <span className="cadence-detail">{detail}</span>}
      </span>
    );
  }

  return (
    <span className={`cadence-mark ${className}`.trim()} data-cadence={cadence} title={full}>
      <Icon size={14} aria-hidden="true" />
      {!labelled && <span className="sr-only">{full}</span>}
    </span>
  );
};
