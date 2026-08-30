import type { Activity, CostModel, RecurrenceType, SpendingEntry } from "./types";

/**
 * How often money moves — as a vocabulary rather than as a sentence
 * =================================================================
 *
 * The application had six ways of saying "this happens every month" and every
 * one of them was words: `recurrenceType`, `costModel`, "Monthly · every 1",
 * "billed once a year", "fixed monthly", "session pack". A reader met the same
 * fact spelled differently on the dashboard, in the activity list, on a
 * transaction row and in the report, and had to translate each one.
 *
 * So the cadences are named here, once, and each gets three channels:
 *
 *   **an icon** — the shape, which is what the eye actually reads. The seven
 *                 differ in *silhouette* rather than in detail: at fourteen
 *                 pixels two calendars are one calendar, so only the three
 *                 genuinely calendar-shaped cadences get a calendar and the
 *                 rest get a loop, a ticket, a stack and a dot;
 *   **a tone**  — a colour drawn from the palette the rest of the app uses;
 *   **a word**  — the label, for the places that have room and for everyone
 *                 who cannot see the first two.
 *
 * Never colour alone. The set is deliberately small — seven — because a
 * vocabulary is only worth learning if it is short enough to learn, and
 * because a colour per concept is not a system, it is a paint chart.
 *
 * This module is pure data and pure functions: no React, no dictionary. The
 * label is a *key*, resolved by whoever renders it, so the same table serves
 * the interface, the report and the server.
 */

export type Cadence =
  | "monthly"
  | "yearly"
  | "weekly"
  | "session"
  | "pack"
  | "scheduled"
  | "oneOff";

export interface CadenceMeta {
  id: Cadence;
  /** Lucide icon name, resolved by `components/ui/CadenceMark`. */
  icon: string;
  /** Translation key for the short label. */
  labelKey: string;
  /**
   * A CSS custom property. Six cadences share three hues on purpose: the
   * *recurring* ones are one family, the *counted* ones another, and the
   * exceptions a third. Reading the family is most of the information.
   */
  tone: string;
}

export const CADENCE_META: Record<Cadence, CadenceMeta> = {
  // Recurring, on a calendar the app knows.
  monthly: { id: "monthly", icon: "Repeat", labelKey: "cadence.monthly", tone: "var(--cadence-recurring)" },
  yearly: { id: "yearly", icon: "CalendarClock", labelKey: "cadence.yearly", tone: "var(--cadence-recurring)" },
  weekly: { id: "weekly", icon: "CalendarDays", labelKey: "cadence.weekly", tone: "var(--cadence-recurring)" },
  scheduled: { id: "scheduled", icon: "CalendarCheck", labelKey: "cadence.scheduled", tone: "var(--cadence-recurring)" },
  // Counted: the cost follows how often you turn up, not what day it is.
  session: { id: "session", icon: "Ticket", labelKey: "cadence.session", tone: "var(--cadence-counted)" },
  pack: { id: "pack", icon: "Layers", labelKey: "cadence.pack", tone: "var(--cadence-counted)" },
  // Once.
  oneOff: { id: "oneOff", icon: "Dot", labelKey: "cadence.oneOff", tone: "var(--cadence-once)" },
};

export const CADENCES = Object.values(CADENCE_META);

/**
 * The cadence of an activity.
 *
 * `costModel` first, because it is the field the editor actually sets and the
 * one the money follows; `recurrenceType` is the older, looser field and is
 * the fallback for activities written before cost models existed.
 */
export function activityCadence(activity: Pick<Activity, "costModel" | "recurrenceType">): Cadence {
  const model: CostModel = activity.costModel ?? "auto";
  switch (model) {
    case "fixedYearly":
      return "yearly";
    case "sessionPack":
      return "pack";
    case "perSession":
      return "session";
    case "schedule":
      return "scheduled";
    case "fixed":
      return "monthly";
    default:
      return recurrenceCadence(activity.recurrenceType);
  }
}

/** The cadence of a bare recurrence value — a transaction's, or a legacy activity's. */
export function recurrenceCadence(recurrence: RecurrenceType | undefined): Cadence {
  switch (recurrence) {
    case "yearly":
      return "yearly";
    case "weekly":
      return "weekly";
    case "session":
      return "session";
    case "custom":
      return "scheduled";
    case "monthly":
      return "monthly";
    case "purchase":
    case "none":
    default:
      return "oneOff";
  }
}

/** The cadence of one transaction. */
export function entryCadence(entry: Pick<SpendingEntry, "recurrenceType">): Cadence {
  return recurrenceCadence(entry.recurrenceType);
}

/**
 * Whether this cadence repeats at all.
 *
 * The one distinction worth drawing above the six: a recurring commitment is a
 * different kind of fact from a purchase, and several summaries only need to
 * know which of the two they are looking at.
 */
export function isRecurring(cadence: Cadence): boolean {
  return cadence !== "oneOff";
}
