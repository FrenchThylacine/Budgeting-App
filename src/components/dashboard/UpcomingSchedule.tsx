import React from "react";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { dayLabel, groupByDay, upcomingSchedule } from "../../domain/upcoming";
import { describeSchedule } from "../../domain/schedule";
import { normalizeAmount } from "../../domain/currency";
import type { BudgetSnapshot } from "../../domain/types";

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
  const { occurrences, undated, horizonDays } = upcomingSchedule(snapshot, now);
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
        <div className="empty-title">Nothing scheduled</div>
        <p className="empty-description">
          Add recurring activities, and give them a day or weekday, to see them here.
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
                <span className="upcoming-day-label">{dayLabel(day.date, now)}</span>
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
                      <span className="upcoming-cadence text-footnote">{describeSchedule(item.activity)}</span>
                      <span className="upcoming-amount money">
                        {/* An occurrence whose price is not stated shows a dash,
                            not a zero: the app does not know what it costs. */}
                        {amount == null ? "—" : money(amount)}
                      </span>
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
          <p className="text-footnote upcoming-note">
            These recur but have no weekday or day of the month, so they cannot be placed on a calendar.
            Set one in the activity to see it above.
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
                  <span className="text-footnote"> avg/mo</span>
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
    </div>
  );
};
