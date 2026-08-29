import React, { useState } from "react";
import { CalendarClock, CalendarPlus, MoreHorizontal } from "lucide-react";
import { dayLabel, groupByDay, upcomingSchedule } from "../../domain/upcoming";
import { describeSchedule } from "../../domain/schedule";
import { normalizeAmount } from "../../domain/currency";
import type { Activity, BudgetSnapshot, ScheduleOverride } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { OccurrenceOverrideDialog } from "./OccurrenceOverrideDialog";
import { useTranslation } from "../../i18n/useTranslation";

interface UpcomingScheduleProps {
  snapshot: BudgetSnapshot;
  /** Formats an amount already converted to the base currency. */
  money: (value: number | null | undefined) => string;
  now?: Date;
}

/**
 * What is actually coming up.
 *
 * This card used to list the five most expensive recurring activities under the
 * heading "Upcoming recurring" — no dates, no chronology, and the same five
 * every month. It answered "what costs the most", which the budget card already
 * answers, rather than "what is about to happen", which nothing did.
 *
 * Only activities with a real schedule can be dated. The rest are shown
 * separately rather than given invented dates: a monthly subscription with no
 * day set has no knowable date, and guessing one would put a figure on the
 * calendar the user never entered. Naming them is also the only way they ever
 * get fixed.
 */
export const UpcomingSchedule: React.FC<UpcomingScheduleProps> = ({ snapshot, money, now = new Date() }) => {
  const { t, formatDate } = useTranslation();
  const updateActivity = useBudgetStore((s) => s.updateActivity);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  const [editing, setEditing] = useState<{ activity: Activity; date: Date } | null>(null);

  const { occurrences, undated, horizonDays } = upcomingSchedule(snapshot, now, 14, t);
  const allDays = groupByDay(occurrences);

  // A twice-weekly activity alone fills a fortnight. Showing every day turns
  // the card into a wall and buries the one-off that actually needs attention,
  // so the list stops at a readable length and says what it left out.
  const MAX_DAYS = 5;
  const days = allDays.slice(0, MAX_DAYS);
  const hiddenOccurrences = allDays.slice(MAX_DAYS).reduce((n, day) => n + day.items.length, 0);

  if (days.length === 0 && undated.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-title">{t("upcoming.nothingScheduled")}</div>
        <p className="empty-description">
          {t("upcoming.addRecurringActivitiesAndGive")}
        </p>
      </div>
    );
  }

  return (
    <div className="upcoming">
      {days.length > 0 && (
        <ol className="upcoming-days">
          {days.map((day) => (
            <li key={day.key} className="upcoming-day">
              <div className="upcoming-day-head">
                <span className="upcoming-day-label">{dayLabel(day.date, now, t, formatDate)}</span>
                <span className="upcoming-day-rule" aria-hidden="true" />
              </div>
              <ul className="upcoming-items">
                {day.items.map((item, index) => {
                  const accent = item.activity.color ?? "var(--accent)";
                  const amount =
                    item.amountNative == null
                      ? null
                      : normalizeAmount(item.amountNative, item.activity.currency, snapshot.settings);
                  return (
                    <li key={`${item.activity.id}-${index}`} className="upcoming-item">
                      <span
                        className="upcoming-dot"
                        style={{ background: accent }}
                        aria-hidden="true"
                      />
                      <span className="upcoming-name">{item.activity.name}</span>
                      {/* Prose, so it is not run through the uppercase the
                          footnote class applies: "PAY EVERY 10 SESSIONS (≈
                          EVERY 5 WEEKS)" is a sentence being shouted. */}
                      <span className="upcoming-cadence text-caption">
                        {/* A payment has its own cadence, which is not the
                            cadence of the sessions: ten sessions at two a week
                            is one payment every five weeks. Saying which is
                            which here is the whole point of the model.

                            No "renewal date you set" marker on a payment: for
                            these models the date always descends from that
                            baseline, so saying it every time states the rule
                            rather than an exception. */}
                        {item.kind === "payment"
                          ? item.cycleNote
                          : (
                            <>
                              {describeSchedule(item.activity)}
                              {item.manual && " · renewal date you set"}
                            </>
                          )}
                      </span>
                      <span
                        className="upcoming-amount money"
                        // What the amount buys, where it is not one occurrence.
                        title={
                          item.sessions != null && amount != null
                            ? `${money(amount)} covers ${item.sessions} sessions`
                            : undefined
                        }
                      >
                        {/* An occurrence whose price is not stated shows a dash,
                            not a zero: the app does not know what it costs. */}
                        {amount == null ? "—" : money(amount)}
                      </span>
                      {/* One-off exceptions act on the recurrence rule, and a
                          payment cycle is not produced by one — skipping "the
                          occurrence on that date" would write an override that
                          changes nothing at all. A control that silently does
                          nothing is worse than no control. */}
                      {mutable && item.kind !== "payment" && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon upcoming-action"
                          onClick={() => setEditing({ activity: item.activity, date: item.date })}
                          aria-label={`Change ${item.activity.name} on ${item.date.toLocaleDateString()}`}
                          title={t("upcoming.skipMoveOrRepriceJust")}
                        >
                          <MoreHorizontal size={15} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {days.length === 0 && undated.length > 0 && (
        <p className="text-caption upcoming-note">
          Nothing is dated in the next {horizonDays} days.
        </p>
      )}

      {undated.length > 0 && (
        <details className="upcoming-undated">
          <summary>
            <CalendarPlus size={14} aria-hidden="true" />
            <span>
              {undated.length} recurring {undated.length === 1 ? "activity has" : "activities have"} no date set
            </span>
          </summary>
          <p className="text-note upcoming-note">
            {t("upcoming.theseRecurButHaveNo")}
          </p>
          <ul className="upcoming-items">
            {undated.slice(0, 8).map(({ activity, monthlyBase }) => (
              <li key={activity.id} className="upcoming-item">
                <span
                  className="upcoming-dot"
                  style={{ background: activity.color ?? "var(--text-tertiary)" }}
                  aria-hidden="true"
                />
                <span className="upcoming-name">{activity.name}</span>
                <span className="upcoming-cadence text-footnote">{activity.recurrenceType}</span>
                <span className="upcoming-amount money">
                  {money(monthlyBase)}
                  {/* Labelled as an average, because a yearly subscription is
                      not a monthly charge even when it divides neatly. */}
                  <span className="text-footnote"> {t("upcoming.avgMo")}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {days.length > 0 && (
        <p className="text-footnote upcoming-note">
          <CalendarClock size={12} aria-hidden="true" />
          {hiddenOccurrences > 0
            ? `${hiddenOccurrences} more in the next ${horizonDays} days`
            : `Next ${horizonDays} days`}
        </p>
      )}
      {editing && (
        <OccurrenceOverrideDialog
          activity={editing.activity}
          date={editing.date}
          currency={editing.activity.currency}
          onCancel={() => setEditing(null)}
          onApply={(overrides: ScheduleOverride[]) => {
            // Goes through updateActivity, which refuses while a closed period
            // is selected and puts the change on the undo stack.
            updateActivity(editing.activity.id, {
              scheduleOverrides: overrides.length > 0 ? overrides : undefined,
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};
