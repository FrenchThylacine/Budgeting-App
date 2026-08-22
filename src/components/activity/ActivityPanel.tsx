import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Circle, Copy, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { currencyOptionsFor, formatMoney } from "../../domain/currency";
import { SwipeRow } from "../ui/SwipeRow";
import { gesturesFor } from "../../domain/gestures";
import { AdvancedFields, EditorSheet } from "../ui/EditorSheet";
import { monthName } from "../../domain/dates";
import { estimateActivity, monthlyEstimateNative, yearlyEstimateNative } from "../../domain/calculations";
import {
  ISO_WEEKDAYS,
  WEEKDAY_SHORT_LABELS,
  describeSchedule,
  hasSchedule,
  nextOccurrences,
  occurrencesInMonth,
  parseLocalDate,
} from "../../domain/schedule";
import {
  describeDays,
  describePaymentCycle,
  fixedYearlyAmount,
  isAveragedMonthly,
  normalizeSessionsPerPayment,
  sessionPackIntervalDays,
  sessionPackPaymentAmount,
  sessionsInMonth,
  sessionsPerWeek,
  yearlyPaymentDates,
  sessionPackPaymentDates,
} from "../../domain/payments";
import type {
  Activity,
  CostModel,
  CurrencyDisplayMode,
  IsoWeekday,
  RecurrenceType,
  SwipeActionId,
} from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import {
  activityToDraft,
  activityPayloadFromDraft,
  draftToActivity,
  matchesActivityFilters,
  sortActivities,
} from "../../utils/formatters";
import type { ActivityDraft } from "../../utils/formatters";
import { ColorPicker, readableAccent, tint } from "../ui/IconPicker";
import { EntityMark, MarkFields } from "../ui/EntityMark";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Field, FieldGroup } from "../ui/Field";
import { Section } from "../ui/Section";

const RECURRENCE_TYPES: RecurrenceType[] = ["weekly", "monthly", "yearly", "session", "purchase", "custom", "none"];

const COST_MODELS: { value: CostModel; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Derived from the recurrence type and whichever price is filled in." },
  { value: "perSession", label: "Per session", hint: "Session price multiplied by the sessions you expect each month." },
  {
    value: "sessionPack",
    label: "Per session, paid in blocks",
    hint: "Sessions happen at one rate and you pay at another — twice a week, settled every ten sessions. Two sessions a week is not two payments a week.",
  },
  { value: "schedule", label: "Real schedule", hint: "Session price multiplied by the occurrences that truly fall in each month." },
  { value: "fixed", label: "Fixed monthly", hint: "One explicit monthly amount, whatever the calendar does." },
  {
    value: "fixedYearly",
    label: "Fixed yearly",
    hint: "A real annual payment on a real date. The monthly figure shown is the year averaged over twelve, and is labelled as such — no monthly charge is ever generated.",
  },
];

type SortMode = "order" | "name" | "cost";

export const ActivityPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addActivity);
  const update = useBudgetStore((s) => s.updateActivity);
  const remove = useBudgetStore((s) => s.removeActivity);
  const duplicate = useBudgetStore((s) => s.duplicateActivity);
  const reorder = useBudgetStore((s) => s.reorderActivity);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const [editing, setEditing] = useState<Activity | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ActivityDraft>(() => activityToDraft(null, snapshot));
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortMode>("order");
  const [dragId, setDragId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const year = snapshot.settings.selectedYear;
  const month = snapshot.settings.selectedMonth;
  const activities = snapshot.years[String(year)]?.activities ?? [];
  const categories = snapshot.categories.filter((category) => !category.archived);
  const categoryName = (id: string) => snapshot.categories.find((category) => category.id === id)?.name ?? "Uncategorised";

  const patch = (changes: Partial<ActivityDraft>) => setForm((current) => ({ ...current, ...changes }));

  const begin = (activity: Activity | null) => {
    setEditing(activity);
    setForm(activityToDraft(activity, snapshot));
    setOpen(true);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const payload = activityPayloadFromDraft(form);
    if (!payload.name || !payload.categoryId) return;
    if (editing) update(editing.id, payload);
    else add(payload);
    setOpen(false);
    setEditing(null);
  };

  useEffect(() => {
    if (open) formRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [open]);

  // Estimates for the *selected* period, so a schedule-driven activity shows
  // what it really costs in this month rather than an averaged guess. Base
  // values drive sorting (comparable across currencies); native values are
  // what the card shows.
  const estimateMap = useMemo(() => {
    const map = new Map<string, { monthlyBase: number; monthlyNative: number; yearlyNative: number }>();
    for (const activity of activities) {
      const estimate = estimateActivity(activity, snapshot, { year, month });
      const monthlyNative = monthlyEstimateNative(activity, { year, month });
      map.set(activity.id, {
        monthlyBase: estimate.monthlyBase,
        monthlyNative,
        yearlyNative: yearlyEstimateNative(activity, monthlyNative, { year, month }),
      });
    }
    return map;
  }, [activities, snapshot, year, month]);

  const orderedAll = useMemo(() => activities.slice().sort((a, b) => a.order - b.order), [activities]);

  const visibleActivities = useMemo(
    () =>
      activities
        .filter((activity) => matchesActivityFilters(activity, { search, categoryId: categoryFilter || undefined }))
        .sort((a, b) => sortActivities(a, b, sortBy, estimateMap)),
    [activities, search, categoryFilter, sortBy, estimateMap],
  );

  // Manual ordering only makes sense while the list is actually in that order.
  const canReorder = mutable && sortBy === "order" && !search && !categoryFilter;
  const activityGestures = gesturesFor(snapshot.settings, "activities");

  const activitySwipe = (action: SwipeActionId, activity: Activity) => {
    if (!mutable || action === "none") return [];
    switch (action) {
      case "archive":
        return [{
          label: activity.visible ? "Hide" : "Show",
          icon: activity.visible ? <EyeOff size={18} /> : <Eye size={18} />,
          onAction: () => update(activity.id, { visible: !activity.visible }),
        }];
      case "edit":
        return [{ label: "Edit", icon: <Pencil size={18} />, onAction: () => begin(activity) }];
      case "duplicate":
        return [{ label: "Duplicate", icon: <Copy size={18} />, onAction: () => duplicate(activity.id) }];
      case "delete":
        return [{
          label: "Delete", icon: <Trash2 size={18} />, destructive: true,
          onAction: () => confirmDelete(activity),
        }];
      default:
        return [];
    }
  };

  /**
   * One delete, two ways in.
   *
   * The swipe and the card's Delete button had the same confirmation text
   * written out twice. Two copies of a warning drift, and the one that drifts
   * is usually the one nobody is looking at.
   */
  const confirmDelete = (activity: Activity) => {
    if (window.confirm(`Delete "${activity.name}"? Linked spending is kept.`)) remove(activity.id);
  };

  const move = (activity: Activity, direction: -1 | 1) => {
    const index = orderedAll.findIndex((item) => item.id === activity.id);
    const target = orderedAll[index + direction];
    if (!target) return;
    reorder(activity.id, target.id);
  };

  const preview = useMemo(
    () => buildPreview(form, editing, year, month, snapshot.settings.currencyDisplayMode),
    [form, editing, year, month, snapshot.settings.currencyDisplayMode],
  );

  /**
   * What the renewal date is currently doing, said where it is entered.
   *
   * Three states worth distinguishing: none set (the rule decides), set and
   * ahead (it wins), and set but already past (it is ignored, and saying so is
   * the difference between a stale field and a broken feature).
   */
  const renewalHint = (() => {
    const parsed = parseLocalDate(form.nextRenewalDate);
    // For the two payment-cycle models the date is not an override at all — it
    // is the baseline the whole series counts from, and a past one is rolled
    // forward rather than ignored. Saying the opposite would be worse than
    // saying nothing.
    if (form.costModel === "fixedYearly") {
      return parsed
        ? "The charge repeats on this day every year. Change it and every future date follows."
        : "Set the day this renews. Without it, the yearly charge cannot be placed on a calendar at all — and the app will not invent a date for it.";
    }
    if (form.costModel === "sessionPack") {
      return parsed
        ? "The payment cycle counts from this date. Change it and every future payment follows."
        : "Set the date of the next payment. Without it, the payments cannot be placed on a calendar and the app will not invent dates for them.";
    }
    if (!parsed) return "Optional. Leave empty to let the schedule decide the next date.";
    const today = new Date();
    if (parsed < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      return "This date has passed, so it is ignored and the schedule decides again. Set the next one, or clear it.";
    }
    return "Overrides the next date in the upcoming timeline. It never changes what the activity costs.";
  })();

  /**
   * The derived halves of the two payment-cycle models, priced through the very
   * same functions that price a saved activity — so the editor can never show a
   * figure the stored record disagrees with.
   */
  const draftActivity = useMemo(() => draftToActivity(form, editing), [form, editing]);
  const money = (value: number | null | undefined) =>
    value == null ? "—" : formatMoney(value, form.currency, snapshot.settings.currencyDisplayMode);

  const packSummary = useMemo(() => {
    const amount = sessionPackPaymentAmount(draftActivity);
    const perPayment = normalizeSessionsPerPayment(draftActivity.sessionsPerPayment);
    const interval = sessionPackIntervalDays(draftActivity);
    const perWeek = sessionsPerWeek(draftActivity);
    if (amount == null || perPayment == null) {
      return { amount: "—", hint: "Fill in a session price and how many sessions one payment covers." };
    }
    const rate =
      perWeek == null
        ? ""
        : ` ${trimNumber(perWeek)} session${perWeek === 1 ? "" : "s"} a week is not ${trimNumber(perWeek)} payment${perWeek === 1 ? "" : "s"} a week —`;
    return {
      amount: `${money(amount)} · ${perPayment} × ${money(draftActivity.pricePerSession)}`,
      hint: `${interval != null ? `About one payment every ${describeDays(interval)}.` : ""}${rate} the sessions and the payments are counted separately.`,
    };
  }, [draftActivity, form.currency, snapshot.settings.currencyDisplayMode]);

  const yearlySummary = useMemo(() => {
    const amount = fixedYearlyAmount(draftActivity);
    const monthly = amount == null ? "—" : `${money(amount / 12)} /month avg.`;
    const dates = yearlyPaymentDates(draftActivity, new Date(), 3);
    if (dates.length === 0) {
      return {
        monthly,
        dates: "No date set",
        hint: "Set the renewal date below and the next three charges appear here.",
      };
    }
    return {
      monthly,
      dates: dates.map((date) => date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })).join(" · "),
      hint: "One charge a year, on the renewal date below — never a monthly one.",
    };
  }, [draftActivity, form.currency, snapshot.settings.currencyDisplayMode]);

  /** The next payments of a session pack, for the renewal group's preview. */
  const packDates = useMemo(
    () =>
      form.costModel === "sessionPack"
        ? sessionPackPaymentDates(draftActivity, new Date(), 3)
            .map((date) => date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }))
            .join(" · ")
        : "",
    [draftActivity, form.costModel],
  );

  const draftAccent = form.color || "";

  return (
    <div className="page-enter" style={{ display: "grid", gap: 20 }}>
      <Section
        title="Recurring activities"
        action={
          <Button variant="primary" disabled={!mutable} onClick={() => begin(null)}>
            <Plus size={16} /> Add activity
          </Button>
        }
      >
        {!mutable && <div className="historical-banner">Historical periods are read-only.</div>}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
            gap: 8,
            marginBottom: 14,
          }}
        >
          <input
            className="input"
            type="search"
            placeholder="Search activities"
            aria-label="Search activities"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="select"
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label="Sort activities"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortMode)}
          >
            <option value="order">Manual order</option>
            <option value="name">Name A–Z</option>
            <option value="cost">Highest monthly cost</option>
          </select>
        </div>

        {open && (
          <EditorSheet
            title={editing ? editing.name || "Edit activity" : "New activity"}
            subtitle={editing ? "Changes apply from the selected period onward." : undefined}
            onClose={() => {
              setOpen(false);
              setEditing(null);
            }}
            footer={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" form="activity-editor-form" variant="primary">
                  {editing ? "Save changes" : "Add activity"}
                </Button>
              </>
            }
          >
          <form
            id="activity-editor-form"
            ref={formRef}
            onSubmit={save}
            style={{ display: "grid", gap: 20 }}
          >
            <FieldGroup title="Identity">
              <Field label="Name" span>
                <input
                  className="input"
                  required
                  placeholder="Padel sessions"
                  value={form.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </Field>
              <Field label="Category">
                <select className="select" value={form.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency">
                <select
                  className="select"
                  value={form.currency}
                  onChange={(event) => patch({ currency: event.target.value as ActivityDraft["currency"] })}
                >
                  {currencyOptionsFor(snapshot.settings, form.currency as ActivityDraft["currency"]).map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
              <Field label="Colour" span group>
                <ColorPicker value={form.color || undefined} onChange={(color) => patch({ color: color ?? "" })} />
              </Field>
            </FieldGroup>

            {/* The same icon controls the wishlist uses, from the same module:
                a library icon and a live preview in view, an image link and a
                site to take the icon from one tap behind. Activities used to
                have the library and nothing else. */}
            <MarkFields
              source={{ icon: form.icon, iconUrl: form.iconUrl, sourceUrl: form.iconSourceUrl }}
              accent={draftAccent || "var(--accent)"}
              fallback={<Circle size={20} color={draftAccent || "var(--accent)"} />}
              sourceLabel="Icon from a website"
              sourcePlaceholder="navigraph.com"
              sourceHint="The developer, publisher or club whose icon identifies this — not necessarily where it is paid for. Nothing here changes any other link."
              onChange={(next) =>
                patch({
                  ...(next.icon !== undefined ? { icon: next.icon } : {}),
                  ...(next.iconUrl !== undefined ? { iconUrl: next.iconUrl } : {}),
                  ...(next.sourceUrl !== undefined ? { iconSourceUrl: next.sourceUrl } : {}),
                })
              }
            />

            <FieldGroup title="Recurrence">
              <Field label="Recurrence type">
                <select
                  className="select"
                  value={form.recurrenceType}
                  onChange={(event) => patch({ recurrenceType: event.target.value as RecurrenceType })}
                >
                  {RECURRENCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Every">
                <input
                  className="input"
                  type="number"
                  min="1"
                  required
                  aria-label="Recurrence interval"
                  value={form.recurrenceInterval}
                  onChange={(event) => patch({ recurrenceInterval: Number(event.target.value) })}
                />
              </Field>
              <Field label="Cost model" span hint={COST_MODELS.find((model) => model.value === form.costModel)?.hint}>
                <select
                  className="select"
                  value={form.costModel}
                  onChange={(event) => patch({ costModel: event.target.value as CostModel })}
                >
                  {COST_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>

            {form.costModel === "perSession" && (
              <FieldGroup title="Sessions">
                <Field label="Sessions per month">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="8"
                    value={form.sessionsPerMonth}
                    onChange={(event) => patch({ sessionsPerMonth: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            )}

            {/* The whole point of this model, laid out so the distinction
                cannot be missed: how often it happens, then how often it is
                paid for, then what one payment is. */}
            {form.costModel === "sessionPack" && (
              <FieldGroup title="Sessions and payments">
                <Field label="Price per session">
                  <input
                    className="input"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="20"
                    value={form.pricePerSession}
                    onChange={(event) => patch({ pricePerSession: event.target.value })}
                  />
                </Field>
                <Field label="Sessions" group hint="How often the activity happens.">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="2"
                      aria-label="Sessions per period"
                      value={form.sessionsPerPeriod}
                      onChange={(event) => patch({ sessionsPerPeriod: event.target.value })}
                      style={{ minWidth: 0 }}
                    />
                    <span className="text-caption" aria-hidden="true">
                      per
                    </span>
                    <select
                      className="select"
                      aria-label="Session frequency unit"
                      value={form.sessionPeriod}
                      onChange={(event) => patch({ sessionPeriod: event.target.value as "week" | "month" })}
                      style={{ width: "auto" }}
                    >
                      <option value="week">week</option>
                      <option value="month">month</option>
                    </select>
                  </div>
                </Field>
                <Field label="Pay after" hint="Sessions bought at once.">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="10"
                    value={form.sessionsPerPayment}
                    onChange={(event) => patch({ sessionsPerPayment: event.target.value })}
                  />
                </Field>
                <Field label="One payment" span group hint={packSummary.hint}>
                  <output className="text-callout" style={{ fontWeight: 600 }}>
                    {packSummary.amount}
                  </output>
                </Field>
              </FieldGroup>
            )}

            {form.costModel === "fixedYearly" && (
              <FieldGroup title="Yearly charge">
                <Field label="Amount per year" emphasised>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="60"
                    value={form.yearlyEstimate}
                    onChange={(event) => patch({ yearlyEstimate: event.target.value })}
                  />
                </Field>
                <Field
                  label="Monthly equivalent"
                  group
                  hint="Shown for comparison only. You are billed once a year — the app never creates a monthly charge for this."
                >
                  <output className="text-callout" style={{ fontWeight: 600 }}>
                    {yearlySummary.monthly}
                  </output>
                </Field>
                <Field label="Next charges" span group hint={yearlySummary.hint}>
                  <output className="text-callout">{yearlySummary.dates}</output>
                </Field>
              </FieldGroup>
            )}

            {form.costModel === "schedule" && (
              <FieldGroup title="Schedule">
                <Field label="Weekdays" span group>
                  <div role="group" aria-label="Weekdays" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {ISO_WEEKDAYS.map((day) => {
                      const selected = form.weekdays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          className={`chip${selected ? " active" : ""}`}
                          aria-pressed={selected}
                          onClick={() =>
                            patch({
                              weekdays: selected
                                ? form.weekdays.filter((value) => value !== day)
                                : ([...form.weekdays, day] as IsoWeekday[]),
                            })
                          }
                        >
                          {WEEKDAY_SHORT_LABELS[day]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Day of month" hint="Used when no weekday is picked">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="15"
                    value={form.dayOfMonth}
                    onChange={(event) => patch({ dayOfMonth: event.target.value })}
                  />
                </Field>
                <Field label="Starts on" hint="Occurrences before this date are ignored">
                  <input
                    className="input"
                    type="date"
                    value={form.startDate}
                    onChange={(event) => patch({ startDate: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            )}

            <FieldGroup title="Prices">
              <Field label="Monthly cost" emphasised={form.costModel === "fixed"}>
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder="—"
                  value={form.pricePerMonth}
                  onChange={(event) => patch({ pricePerMonth: event.target.value })}
                />
              </Field>
              <Field
                label="Session cost"
                emphasised={form.costModel === "perSession" || form.costModel === "schedule" || form.costModel === "sessionPack"}
              >
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder="—"
                  value={form.pricePerSession}
                  onChange={(event) => patch({ pricePerSession: event.target.value })}
                />
              </Field>
              <Field label="Purchase cost" emphasised={form.recurrenceType === "purchase"}>
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder="—"
                  value={form.pricePerPurchase}
                  onChange={(event) => patch({ pricePerPurchase: event.target.value })}
                />
              </Field>
              <Field
                label="Yearly estimate"
                emphasised={form.recurrenceType === "yearly" || form.costModel === "fixedYearly"}
                hint={form.costModel === "fixedYearly" ? "The same field as the yearly charge above." : undefined}
              >
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder="—"
                  value={form.yearlyEstimate}
                  onChange={(event) => patch({ yearlyEstimate: event.target.value })}
                />
              </Field>
              <Field label="Estimated cost" hint="Fallback used by the automatic model">
                <input
                  className="input"
                  type="number"
                  step="any"
                  placeholder="—"
                  value={form.estimatedCost}
                  onChange={(event) => patch({ estimatedCost: event.target.value })}
                />
              </Field>
            </FieldGroup>

            <div
              aria-live="polite"
              style={{
                display: "grid",
                gap: 4,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                background: draftAccent ? tint(draftAccent, 0.1) : "var(--bg-subtle)",
                border: `1px solid ${draftAccent ? tint(draftAccent, 0.3) : "var(--border)"}`,
              }}
            >
              <div className="text-footnote">Live estimate</div>
              <div className="text-callout" style={{ fontWeight: 600, wordBreak: "break-word" }}>
                {preview.headline}
              </div>
              {preview.detail && (
                <div className="text-caption" style={{ wordBreak: "break-word" }}>
                  {preview.detail}
                </div>
              )}
            </div>

            {/* Not inside the schedule group: it applies whether or not there
                is a schedule, and it is most useful precisely where there is
                not one — an annual subscription that renews on the day it was
                bought, which no recurrence rule can know. */}
            <FieldGroup
              title={
                form.costModel === "sessionPack"
                  ? "Next payment"
                  : form.costModel === "fixedYearly"
                    ? "Renewal date"
                    : "Next renewal"
              }
            >
              <Field
                label={form.costModel === "sessionPack" ? "Next payment falls on" : "Renews on"}
                span
                hint={renewalHint}
              >
                <input
                  className="input"
                  type="date"
                  value={form.nextRenewalDate}
                  onChange={(event) => patch({ nextRenewalDate: event.target.value })}
                />
              </Field>
              {packDates && (
                <Field label="Then" span group hint="Every payment after that, from the date above.">
                  <output className="text-callout">{packDates}</output>
                </Field>
              )}
              {form.nextRenewalDate && form.costModel !== "sessionPack" && form.costModel !== "fixedYearly" && (
                <Field label="Clear it" group>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patch({ nextRenewalDate: "" })}>
                    Use the schedule instead
                  </Button>
                </Field>
              )}
            </FieldGroup>

            <AdvancedFields label="Season, notes and visibility">
            <FieldGroup title="Details">
              <Field label="Seasonal tag" hint="e.g. summer, winter, normal">
                <input
                  className="input"
                  placeholder="normal"
                  value={form.seasonalTag}
                  onChange={(event) => patch({ seasonalTag: event.target.value })}
                />
              </Field>
              <Field label="Notes" span>
                <input
                  className="input"
                  placeholder="Anything worth remembering"
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </Field>
              <Field label="Status" span group>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <label className="text-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={form.active} onChange={(event) => patch({ active: event.target.checked })} />
                    Active — counts toward the budget
                  </label>
                  <label className="text-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={form.visible} onChange={(event) => patch({ visible: event.target.checked })} />
                    Visible in summaries
                  </label>
                </div>
              </Field>
            </FieldGroup>

            </AdvancedFields>
          </form>
          </EditorSheet>
        )}
      </Section>

      {activities.length === 0 ? (
        <EmptyState title="No activities" description="Track recurring costs such as subscriptions, lessons, and bills." />
      ) : visibleActivities.length === 0 ? (
        <EmptyState title="No matches" description="No activity matches the current search or category filter." />
      ) : (
        <div className="item-list">
          {visibleActivities.map((activity) => {
            const accent = activity.color;
            const estimate = estimateMap.get(activity.id);
            const orderIndex = orderedAll.findIndex((item) => item.id === activity.id);
            return (
              <SwipeRow
                key={activity.id}
                label={activity.name}
                // Touch-only, so it does not collide with the mouse-driven
                // drag-to-reorder on the same card: HTML5 dragstart never
                // fires from a finger.
                trailing={activitySwipe(activityGestures.trailing, activity)}
                leading={activitySwipe(activityGestures.leading, activity)}
              >
              <div
                className={`item-row${mutable ? " editable-row" : ""}`}
                // The whole card opens the editor, so the small icon buttons
                // stop being the only way in — they are a poor target on a
                // phone and easy to miss entirely.
                role={mutable ? "button" : undefined}
                tabIndex={mutable ? 0 : undefined}
                aria-label={mutable ? `Edit ${activity.name}` : undefined}
                onClick={(event) => {
                  // A click that landed on one of the card's own controls, or
                  // that finished a text selection, is not a request to edit.
                  if (!mutable) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("button, a, input, select, textarea")) return;
                  if (window.getSelection()?.toString()) return;
                  begin(activity);
                }}
                onKeyDown={(event) => {
                  if (!mutable) return;
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    begin(activity);
                  }
                }}
                draggable={canReorder}
                onDragStart={() => setDragId(activity.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => {
                  if (canReorder && dragId && dragId !== activity.id) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (canReorder && dragId && dragId !== activity.id) reorder(dragId, activity.id);
                  setDragId(null);
                }}
                style={{
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 12,
                  opacity: dragId === activity.id ? 0.5 : 1,
                  // The tint is layered over the theme's own surface, so the
                  // card keeps its contrast in both light and dark mode.
                  background: accent
                    ? `linear-gradient(0deg, ${tint(accent, 0.11)}, ${tint(accent, 0.11)}), var(--bg-elevated)`
                    : "var(--bg-subtle)",
                  border: `1px solid ${accent ? tint(accent, 0.3) : "var(--border)"}`,
                  borderLeft: `3px solid ${accent ?? "var(--border-strong)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 180px" }}>
                  {canReorder && (
                    <GripVertical
                      size={15}
                      aria-hidden="true"
                      style={{ flex: "0 0 auto", color: "var(--text-tertiary)", cursor: "grab" }}
                    />
                  )}
                  <EntityMark
                    source={{ icon: activity.icon, iconUrl: activity.iconUrl, sourceUrl: activity.iconSourceUrl }}
                    accent={accent ?? "var(--text-secondary)"}
                    fallback={<Circle size={16} color={accent ? readableAccent(accent) : "var(--text-secondary)"} />}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="text-callout" style={{ fontWeight: 600, wordBreak: "break-word" }}>
                      {activity.name}
                      {!activity.visible && (
                        <EyeOff size={13} aria-label="Hidden from summaries" style={{ marginLeft: 6, verticalAlign: "-2px" }} />
                      )}
                    </div>
                    <div className="text-footnote" style={{ letterSpacing: "0.02em", textTransform: "none" }}>
                      {describeActivity(activity, year, month)}
                    </div>
                    <div className="text-caption" style={{ marginTop: 2 }}>
                      {categoryName(activity.categoryId)}
                      {activity.seasonalTag ? ` · ${activity.seasonalTag}` : ""}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                  <div style={{ textAlign: "right", minWidth: 0 }}>
                    <strong style={{ whiteSpace: "nowrap" }}>
                      {formatMoney(estimate?.monthlyNative ?? 0, activity.currency, snapshot.settings.currencyDisplayMode)}
                      {/* An annual charge divided by twelve is an average, not
                          a payment. Labelling it "/month" like a subscription
                          invites someone to look for a charge that never
                          arrives. */}
                      <span className="text-caption">
                        {isAveragedMonthly(activity) ? " /month avg." : " /month"}
                      </span>
                    </strong>
                    <div className="text-caption" style={{ whiteSpace: "nowrap" }}>
                      {formatMoney(estimate?.yearlyNative ?? 0, activity.currency, snapshot.settings.currencyDisplayMode)} /year
                    </div>
                  </div>
                  {mutable && (
                    <div className="row-actions">
                      {canReorder && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon
                            disabled={orderIndex <= 0}
                            onClick={() => move(activity, -1)}
                            aria-label={`Move ${activity.name} up`}
                          >
                            <ArrowUp size={15} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon
                            disabled={orderIndex < 0 || orderIndex >= orderedAll.length - 1}
                            onClick={() => move(activity, 1)}
                            aria-label={`Move ${activity.name} down`}
                          >
                            <ArrowDown size={15} />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => update(activity.id, { visible: !activity.visible })}
                        aria-label={activity.visible ? `Hide ${activity.name}` : `Show ${activity.name}`}
                      >
                        {activity.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => duplicate(activity.id)}
                        aria-label={`Duplicate ${activity.name}`}
                      >
                        <Copy size={15} />
                      </Button>
                      <Button variant="ghost" size="sm" icon onClick={() => begin(activity)} aria-label={`Edit ${activity.name}`}>
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => confirmDelete(activity)}
                        aria-label={`Delete ${activity.name}`}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              </SwipeRow>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** One-line summary of how an activity recurs and what drives its price. */
function describeActivity(activity: Activity, year: number, month: number): string {
  const model = activity.costModel ?? "auto";
  const state = activity.active ? "active" : "paused";
  if (model === "schedule" && hasSchedule(activity)) {
    const count = occurrencesInMonth(activity, year, month);
    return `${describeSchedule(activity)} · ${count} in ${monthName(month)} · ${state}`;
  }
  if (model === "perSession") {
    return `${activity.sessionsPerMonth ?? 0} sessions/month · ${state}`;
  }
  if (model === "sessionPack") {
    // Both facts, in that order: what happens, and what is paid. The card is
    // the one place someone glances at rather than reads, so it must not leave
    // the impression that a €200 charge lands twice a week.
    const sessions = sessionsInMonth(activity, year, month);
    const cycle = describePaymentCycle(activity);
    const monthly = sessions == null ? "" : `≈ ${trimNumber(sessions)} in ${monthName(month)} · `;
    return `${monthly}${cycle ?? "session pack"} · ${state}`;
  }
  if (model === "fixedYearly") {
    return `billed once a year · ${state}`;
  }
  if (model === "fixed") {
    return `fixed monthly · ${state}`;
  }
  return `${activity.recurrenceType} · every ${activity.recurrenceInterval} · ${state}`;
}

/** A number with at most two decimals and no trailing zeroes. */
function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

interface Preview {
  headline: string;
  detail: string;
}

/**
 * Prices the in-progress form through the very same functions that price a
 * saved activity, so the preview can never drift from the stored maths.
 */
function buildPreview(
  draft: ActivityDraft,
  editing: Activity | null,
  year: number,
  month: number,
  // The user's own display mode, not a hardcoded one. The preview and the card
  // it previews were formatting the same figure two different ways — "€ 200,00"
  // in the estimate and "€ EUR 200,00" on the row — which reads as two numbers.
  displayMode: CurrencyDisplayMode,
): Preview {
  const activity = draftToActivity(draft, editing);
  const period = { year, month };
  const monthly = monthlyEstimateNative(activity, period);
  const yearly = yearlyEstimateNative(activity, monthly, period);
  const money = (value: number | null | undefined) => formatMoney(value ?? 0, activity.currency, displayMode);
  const totals = `≈ ${money(monthly)}/month, ${money(yearly)}/year`;

  if (!activity.active) {
    return { headline: "Paused — contributes nothing to the budget.", detail: `Would be ${totals.slice(2)} when active.` };
  }

  switch (activity.costModel ?? "auto") {
    case "perSession": {
      const sessions = activity.sessionsPerMonth ?? 0;
      if (activity.pricePerSession == null) return { headline: "Add a session cost to see the estimate.", detail: "" };
      return {
        headline: `${money(activity.pricePerSession)}/session × ${formatCount(sessions, "session")} ${totals}`,
        detail: "Sessions are assumed to repeat every month.",
      };
    }
    case "schedule": {
      if (!hasSchedule(activity)) return { headline: "Pick weekdays or a day of the month.", detail: "" };
      if (activity.pricePerSession == null && activity.estimatedCost == null) {
        return { headline: "Add a session cost to see the estimate.", detail: `Schedule: ${describeSchedule(activity)}.` };
      }
      const price = activity.pricePerSession ?? activity.estimatedCost ?? 0;
      const count = occurrencesInMonth(activity, year, month);
      const upcoming = nextOccurrences(activity, new Date(), 3)
        .map((date) => date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }))
        .join(" · ");
      return {
        headline: `${money(price)}/session × ${formatCount(count, "occurrence")} in ${monthName(month)} ${totals}`,
        detail: `${describeSchedule(activity)}${upcoming ? ` · Next: ${upcoming}` : ""} · The year sums twelve real months, not one month × 12.`,
      };
    }
    case "fixed": {
      if (activity.pricePerMonth == null) return { headline: "Add a monthly cost to see the estimate.", detail: "" };
      return { headline: `${money(activity.pricePerMonth)}/month ${totals}`, detail: "A flat amount, whatever the calendar does." };
    }
    case "sessionPack": {
      const payment = sessionPackPaymentAmount(activity);
      const perPayment = normalizeSessionsPerPayment(activity.sessionsPerPayment);
      if (activity.pricePerSession == null) return { headline: "Add a session cost to see the estimate.", detail: "" };
      if (perPayment == null) {
        return { headline: "Say how many sessions one payment covers.", detail: "Until then this is priced per session." };
      }
      const interval = sessionPackIntervalDays(activity);
      const sessions = sessionsInMonth(activity, year, month);
      return {
        headline: `${money(payment)} every ${perPayment} sessions ${totals.replace("/month", "/month avg.")}`,
        detail: `${sessions == null ? "" : `About ${formatCount(Math.round(sessions * 100) / 100, "session")} in ${monthName(month)}. `}${
          interval == null ? "" : `That is one payment about every ${describeDays(interval)}. `
        }The monthly figure spreads the pack across the month; the payment lands in one go.`,
      };
    }
    case "fixedYearly": {
      const amount = fixedYearlyAmount(activity);
      if (amount == null) return { headline: "Add the yearly amount to see the estimate.", detail: "" };
      const dates = yearlyPaymentDates(activity, new Date(), 2);
      return {
        headline: `${money(amount)}/year ≈ ${money(amount / 12)}/month avg.`,
        detail:
          dates.length > 0
            ? `Billed once a year on ${dates
                .map((date) => date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }))
                .join(", then ")}. The monthly figure is an average, not a charge.`
            : "Billed once a year. Set a renewal date below so the charge can be placed on the timeline — the app will not invent one.",
      };
    }
    default: {
      /*
       * A yearly charge is not a monthly payment.
       *
       * The monthly figure for an annual subscription is the year divided by
       * twelve — useful for comparing commitments, and wrong as a description
       * of when money leaves the account. Saying so is the difference between
       * a budgeting average and a bill the user starts looking for.
       */
      const yearly = activity.recurrenceType === "yearly";
      return {
        headline: `Automatic from “${activity.recurrenceType}” ${totals}`,
        detail: yearly
          ? "The monthly figure is the year averaged over twelve — you are billed once. Give it a renewal date below to put the real charge on the timeline."
          : "Switch cost model for per-session, real-schedule, or fixed pricing.",
      };
    }
  }
}

function formatCount(value: number, noun: string): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return `${rounded} ${noun}${rounded === 1 ? "" : "s"}`;
}
