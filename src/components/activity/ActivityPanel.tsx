import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { SwipeRow } from "../ui/SwipeRow";
import { monthName } from "../../domain/dates";
import { estimateActivity, monthlyEstimateNative, yearlyEstimateNative } from "../../domain/calculations";
import {
  ISO_WEEKDAYS,
  WEEKDAY_SHORT_LABELS,
  describeSchedule,
  hasSchedule,
  nextOccurrences,
  occurrencesInMonth,
} from "../../domain/schedule";
import type { Activity, CostModel, IsoWeekday, RecurrenceType } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import {
  activityToDraft,
  activityPayloadFromDraft,
  draftToActivity,
  matchesActivityFilters,
  sortActivities,
} from "../../utils/formatters";
import type { ActivityDraft } from "../../utils/formatters";
import { ActivityIcon, ColorPicker, IconPicker, readableAccent, tint } from "../ui/IconPicker";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

const RECURRENCE_TYPES: RecurrenceType[] = ["weekly", "monthly", "yearly", "session", "purchase", "custom", "none"];

const COST_MODELS: { value: CostModel; label: string; hint: string }[] = [
  { value: "auto", label: "Automatic", hint: "Derived from the recurrence type and whichever price is filled in." },
  { value: "perSession", label: "Per session", hint: "Session price multiplied by the sessions you expect each month." },
  { value: "schedule", label: "Real schedule", hint: "Session price multiplied by the occurrences that truly fall in each month." },
  { value: "fixed", label: "Fixed monthly", hint: "One explicit monthly amount, whatever the calendar does." },
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

  const move = (activity: Activity, direction: -1 | 1) => {
    const index = orderedAll.findIndex((item) => item.id === activity.id);
    const target = orderedAll[index + direction];
    if (!target) return;
    reorder(activity.id, target.id);
  };

  const preview = useMemo(() => buildPreview(form, editing, year, month), [form, editing, year, month]);

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
          <form
            ref={formRef}
            className="card card-body"
            onSubmit={save}
            style={{ display: "grid", gap: 16, marginBottom: 16 }}
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
                  {CURRENCY_OPTIONS.map((currency) => (
                    <option key={currency}>{currency}</option>
                  ))}
                </select>
              </Field>
              <Field label="Icon" group>
                <IconPicker value={form.icon || undefined} accent={draftAccent || undefined} onChange={(icon) => patch({ icon: icon ?? "" })} />
              </Field>
              <Field label="Colour" span group>
                <ColorPicker value={form.color || undefined} onChange={(color) => patch({ color: color ?? "" })} />
              </Field>
            </FieldGroup>

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
              <Field label="Session cost" emphasised={form.costModel === "perSession" || form.costModel === "schedule"}>
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
              <Field label="Yearly estimate" emphasised={form.recurrenceType === "yearly"}>
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button type="submit" variant="primary">
                {editing ? "Save changes" : "Add activity"}
              </Button>
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
            </div>
          </form>
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
                trailing={
                  mutable
                    ? [
                        {
                          label: activity.visible ? "Hide" : "Show",
                          icon: activity.visible ? <EyeOff size={18} /> : <Eye size={18} />,
                          onAction: () => update(activity.id, { visible: !activity.visible }),
                        },
                      ]
                    : []
                }
              >
              <div
                className="item-row"
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
                  <span
                    aria-hidden="true"
                    style={{
                      display: "grid",
                      placeItems: "center",
                      flex: "0 0 auto",
                      width: 34,
                      height: 34,
                      borderRadius: "var(--radius-md)",
                      background: accent ? tint(accent, 0.18) : "var(--bg-inset)",
                      border: `1px solid ${accent ? tint(accent, 0.32) : "var(--border)"}`,
                      color: accent ? readableAccent(accent) : "var(--text-secondary)",
                    }}
                  >
                    <ActivityIcon name={activity.icon} size={17} color="currentColor" />
                  </span>
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
                      <span className="text-caption"> /month</span>
                    </strong>
                    <div className="text-caption" style={{ whiteSpace: "nowrap" }}>
                      {formatMoney(estimate?.yearlyNative ?? 0, activity.currency, snapshot.settings.currencyDisplayMode)} /year
                    </div>
                  </div>
                  {mutable && (
                    <div style={{ display: "flex", gap: 4 }}>
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
                        onClick={() => {
                          if (window.confirm(`Delete "${activity.name}"? Linked spending is kept.`)) remove(activity.id);
                        }}
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

const FieldGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
    <legend className="text-footnote" style={{ padding: 0, marginBottom: 8 }}>
      {title}
    </legend>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 10 }}>
      {children}
    </div>
  </fieldset>
);

/**
 * A labelled form field. `group` renders a div instead of a label: a label may
 * only own one control, so sets of chips, swatches, or checkboxes get a plain
 * heading and carry their own `aria-label` on the group.
 */
const Field: React.FC<{
  label: string;
  hint?: string;
  span?: boolean;
  emphasised?: boolean;
  group?: boolean;
  children: React.ReactNode;
}> = ({ label, hint, span, emphasised, group, children }) => {
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper style={{ display: "grid", gap: 4, minWidth: 0, gridColumn: span ? "1 / -1" : undefined }}>
      <span className="text-caption" style={{ fontWeight: emphasised ? 700 : 500, color: emphasised ? "var(--accent)" : undefined }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>
          {hint}
        </span>
      )}
    </Wrapper>
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
  if (model === "fixed") {
    return `fixed monthly · ${state}`;
  }
  return `${activity.recurrenceType} · every ${activity.recurrenceInterval} · ${state}`;
}

interface Preview {
  headline: string;
  detail: string;
}

/**
 * Prices the in-progress form through the very same functions that price a
 * saved activity, so the preview can never drift from the stored maths.
 */
function buildPreview(draft: ActivityDraft, editing: Activity | null, year: number, month: number): Preview {
  const activity = draftToActivity(draft, editing);
  const period = { year, month };
  const monthly = monthlyEstimateNative(activity, period);
  const yearly = yearlyEstimateNative(activity, monthly, period);
  const money = (value: number | null | undefined) => formatMoney(value ?? 0, activity.currency, "symbol");
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
    default:
      return {
        headline: `Automatic from “${activity.recurrenceType}” ${totals}`,
        detail: "Switch cost model for per-session, real-schedule, or fixed pricing.",
      };
  }
}

function formatCount(value: number, noun: string): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return `${rounded} ${noun}${rounded === 1 ? "" : "s"}`;
}
