import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Circle,
  Eye,
  Copy,
  EyeOff,
  GripVertical,
  HelpCircle,
  Pencil,
  Plus,
  Power,
  Trash2,
} from "lucide-react";
import { currencyOptionsFor, formatMoney, numberLocale, displayEquivalent } from "../../domain/currency";
import { SwipeRow } from "../ui/SwipeRow";
import { RowMenu } from "../ui/RowMenu";
import { CadenceMark } from "../ui/CadenceMark";
import { activityCadence } from "../../domain/cadence";
import { Total } from "../ui/Money";
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
  formatDualMoney,
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
import { FundingMark } from "../ui/FundingMark";
import { MarkLegend } from "../ui/MarkLegend";
import { InfoDot } from "../ui/InfoDot";
import { activityBudgetSummary, fundingShares, type ActivityMonthCost } from "../../domain/activityBudget";
import { FUNDING_KINDS, FUNDING_META, FUNDING_SOURCES, activityFundingKind, fundedByName, type FundingKind } from "../../domain/funding";
import { useTranslation } from "../../i18n/useTranslation";
import type { Translator } from "../../domain/i18n";

const RECURRENCE_TYPES: RecurrenceType[] = ["weekly", "monthly", "yearly", "session", "purchase", "custom", "none"];

/** Keys, not words: a module-level table has no translator. */
const COST_MODELS: { value: CostModel; labelKey: string; hintKey: string }[] = [
  { value: "auto", labelKey: "activity.modelAuto", hintKey: "activity.derivedFromTheRecurrenceType" },
  { value: "perSession", labelKey: "activity.perSession", hintKey: "activity.sessionPriceMultipliedByThe" },
  { value: "sessionPack", labelKey: "activity.perSessionPaidInBlocks", hintKey: "activity.sessionsHappenAtOneRate" },
  { value: "schedule", labelKey: "activity.realSchedule", hintKey: "activity.sessionPriceMultipliedByThe2" },
  { value: "fixed", labelKey: "activity.fixedMonthly", hintKey: "activity.oneExplicitMonthlyAmountWhatever" },
  { value: "fixedYearly", labelKey: "activity.fixedYearly", hintKey: "activity.aRealAnnualPaymentOn" },
  { value: "installments", labelKey: "activity.modelInstallments", hintKey: "activity.modelInstallmentsHint" },
];

type SortMode = "order" | "name" | "cost";

export const ActivityPanel: React.FC = () => {
  const { t, formatDate, monthNames } = useTranslation();
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
  const categoryName = (id: string) =>
    snapshot.categories.find((category) => category.id === id)?.name ?? t("common.uncategorised");
  /**
   * The colour that identifies an activity's category.
   *
   * Read from the category itself, so changing Health's colour in Settings
   * changes every Health card. An activity may carry a colour of its own; that
   * is a deliberate override and wins.
   */
  const categoryColour = (id: string) => snapshot.categories.find((category) => category.id === id)?.color;

  const patch = (changes: Partial<ActivityDraft>) => setForm((current) => ({ ...current, ...changes }));

  /*
   * The plan, restated.
   *
   * The total is derived rather than stored, and shown in its own field so
   * somebody who thinks in totals can type one; the sentence beneath repeats
   * the whole plan so nobody has to multiply in their head to check they meant
   * what they typed.
   */
  const installmentCountValue = Number(form.installmentCount);
  const installmentAmountValue = Number(form.installmentAmount);
  const installmentPlanValid =
    Number.isFinite(installmentCountValue) &&
    installmentCountValue >= 1 &&
    Number.isFinite(installmentAmountValue) &&
    installmentAmountValue > 0;
  const installmentTotalField = installmentPlanValid
    ? String(Math.round(installmentCountValue * installmentAmountValue * 100) / 100)
    : "";
  const installmentSummary = installmentPlanValid
    ? t("activity.installmentPlan", {
        count: installmentCountValue,
        amount: formatMoney(installmentAmountValue, form.currency, snapshot.settings.currencyDisplayMode),
        total: formatMoney(
          installmentCountValue * installmentAmountValue,
          form.currency,
          snapshot.settings.currencyDisplayMode,
        ),
      })
    : null;

  /**
   * Which price field the chosen cost model actually reads.
   *
   * The editor showed all five at once — monthly, per session, per purchase,
   * yearly and a fallback estimate — of which exactly one is ever used. Four
   * empty boxes beside the one that matters is not a form, it is a quiz. The
   * rest are still there, one press behind, because `auto` genuinely can read
   * whichever is filled in.
   */
  const relevantPrice = (field: "pricePerMonth" | "pricePerSession" | "pricePerPurchase" | "yearlyEstimate"): boolean => {
    const model = form.costModel ?? "auto";
    if (model === "fixed") return field === "pricePerMonth";
    if (model === "perSession" || model === "sessionPack" || model === "schedule") return field === "pricePerSession";
    if (model === "fixedYearly") return field === "yearlyEstimate";
    // `auto` follows the recurrence type, which is what it is documented to do.
    if (form.recurrenceType === "yearly") return field === "yearlyEstimate";
    if (form.recurrenceType === "session") return field === "pricePerSession";
    if (form.recurrenceType === "purchase") return field === "pricePerPurchase";
    return field === "pricePerMonth";
  };

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

  /**
   * The financial overview, from the one module that knows the difference
   * between a monthly accrual and money actually due this month.
   *
   * The panel does no arithmetic of its own: every figure below — the totals,
   * the funding split, "required this month", the per-row due state — comes
   * out of `activityBudgetSummary`, which the reports and the statistics page
   * read too. Two screens cannot disagree about a budget they compute once.
   */
  const summary = useMemo(() => activityBudgetSummary(snapshot, year, month), [snapshot, year, month]);
  const dueByActivity = useMemo(
    () => new Map<string, ActivityMonthCost>(summary.items.map((item) => [item.activity.id, item])),
    [summary],
  );
  /*
   * The month, in the language the rest of the sentence is in.
   *
   * `monthName()` from `domain/dates.ts` is English-only, so "Required in
   * {month}" rendered as "Nécessaire en August" — an English word inside a
   * French sentence, which is exactly the failure the translation layer
   * exists to prevent. `monthNames()` goes through `Intl`.
   */
  const monthLabel = monthNames()[month - 1] ?? monthName(month);
  /** Totals are in the display currency; the editor's `money` is native. */
  const baseMoney = (value: number | null | undefined) => formatDualMoney(value, snapshot.settings);

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
      case "deactivate":
        // Deliberately distinct from Hide below. This one changes what the
        // budget adds up to; Hide changes only what is on screen.
        return [{
          label: activity.active ? t("activities.deactivate") : t("activities.reactivate"),
          icon: <Power size={18} />,
          onAction: () => toggleActive(activity),
        }];
      case "archive":
        return [{
          label: activity.visible ? t("activities.hide") : t("activities.show"),
          icon: activity.visible ? <EyeOff size={18} /> : <Eye size={18} />,
          onAction: () => update(activity.id, { visible: !activity.visible }),
        }];
      case "edit":
        return [{ label: t("common.edit"), icon: <Pencil size={18} />, onAction: () => begin(activity) }];
      case "duplicate":
        return [{ label: t("common.duplicate"), icon: <Copy size={18} />, onAction: () => duplicate(activity.id) }];
      case "delete":
        return [{
          label: t("common.delete"), icon: <Trash2 size={18} />, destructive: true,
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
    if (window.confirm(t("activities.confirmDelete", { name: activity.name }))) remove(activity.id);
  };

  /**
   * Switch an activity off, or back on.
   *
   * Switching **off** asks first, because it silently changes every total on
   * the page — it is not destructive, but a budget that quietly drops by €60
   * with no explanation is worse than one that asks. Switching back on does
   * not ask: restoring something is not a decision that needs guarding, and a
   * confirmation on the recovery path is what makes people stop using it.
   */
  const toggleActive = (activity: Activity) => {
    if (!activity.active) {
      update(activity.id, { active: true });
      return;
    }
    if (window.confirm(t("activities.confirmDeactivate", { name: activity.name }))) {
      update(activity.id, { active: false });
    }
  };

  const move = (activity: Activity, direction: -1 | 1) => {
    const index = orderedAll.findIndex((item) => item.id === activity.id);
    const target = orderedAll[index + direction];
    if (!target) return;
    reorder(activity.id, target.id);
  };

  const preview = useMemo(
    () => buildPreview(form, editing, year, month, snapshot.settings.currencyDisplayMode, t, monthNames(), formatDate),
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
        ? t("activity.yearlyDateSet")
        : t("activity.yearlyDateMissing");
    }
    if (form.costModel === "sessionPack") {
      return parsed
        ? t("activity.packDateSet")
        : t("activity.packDateMissing");
    }
    if (!parsed) return t("activity.dateOptional");
    const today = new Date();
    if (parsed < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      return t("activity.datePassed");
    }
    return t("activity.dateOverrides");
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
      return { amount: "—", hint: t("activity.fillInASessionPrice") };
    }
    return {
      amount: t("activity.packAmount", {
        payment: money(amount),
        count: perPayment,
        price: money(draftActivity.pricePerSession),
      }),
      hint: [
        interval != null ? t("activity.packInterval", { interval: describeDays(interval, t, true) }) : null,
        // A string, so a fractional rate ("8.67 a week") does not fire the
        // plural rule on a rounded integer.
        perWeek != null ? t("activity.packNotPayments", { rate: trimNumber(perWeek) }) : null,
        t("activity.packCountedSeparately"),
      ]
        .filter(Boolean)
        .join(" "),
    };
  }, [draftActivity, form.currency, snapshot.settings.currencyDisplayMode]);

  const yearlySummary = useMemo(() => {
    const amount = fixedYearlyAmount(draftActivity);
    const monthly = amount == null ? "—" : `${money(amount / 12)} ${t("common.perMonthAverage")}`;
    const dates = yearlyPaymentDates(draftActivity, new Date(), 3);
    if (dates.length === 0) {
      return {
        monthly,
        dates: t("activity.noDateSet"),
        hint: t("activity.setTheRenewalDateBelow"),
      };
    }
    return {
      monthly,
      dates: dates.map((date) => date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })).join(" · "),
      hint: t("activity.oneChargeAYearOn"),
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
        title={t("activities.title")}
        action={
          <Button variant="primary" data-action="add-activity" disabled={!mutable} onClick={() => begin(null)}>
            <Plus size={16} /> {t("activities.add")}
          </Button>
        }
      >
        {!mutable && <div className="historical-banner">{t("common.readOnly")}</div>}

        {/* Search across the top, the two selects sharing the row beneath.
            `auto-fit` with a 160px floor gave three stacked full-width rows on
            a phone — three rows of chrome before the first activity. */}
        <div className="filter-bar">
          <input
            className="input"
            type="search"
            placeholder={t("activities.searchPlaceholder")}
            aria-label={t("activities.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="select"
            aria-label={t("activity.filterByCategory")}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">{t("activities.allCategories")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            aria-label={t("activity.sortActivities")}
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortMode)}
          >
            <option value="order">{t("activities.sortManual")}</option>
            <option value="name">{t("activities.sortName")}</option>
            <option value="cost">{t("activities.sortCost")}</option>
          </select>
        </div>

        {open && (
          <EditorSheet
            title={editing ? editing.name || t("activities.edit") : t("activities.new")}
            subtitle={editing ? t("activities.editSubtitle") : undefined}
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
                  {t("common.cancel")}
                </Button>
                <Button type="submit" form="activity-editor-form" variant="primary">
                  {editing ? t("common.save") : t("activities.add")}
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
            <FieldGroup title={t("activities.groupIdentity")}>
              <Field label={t("activities.fieldName")} name="name" span>
                <input
                  className="input"
                  required
                  placeholder={t("activity.padelSessions")}
                  value={form.name}
                  onChange={(event) => patch({ name: event.target.value })}
                />
              </Field>
              <Field label={t("spending.category")} name="category">
                <select className="select" value={form.categoryId} onChange={(event) => patch({ categoryId: event.target.value })}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("spending.currency")}>
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
            </FieldGroup>

            {/* Who pays.

                Placed with the identity rather than with the prices, because
                it is a fact *about* the activity — my lessons, my father's
                lessons — not a way of pricing it. It is also the default for
                every transaction linked to this activity, which the spending
                editor states out loud and can still override. */}
            <FieldGroup title={t("funding.label")}>
              <Field
                label={t("funding.label")}
                name="funding"
                span={form.fundingSource !== "other"}
                /* The hint explains what the choice *does* to the budget,
                   which is only worth saying for the two that do something
                   unexpected. "Counts against your budget" under the default
                   is a sentence explaining the absence of a surprise. */
                hint={form.fundingSource === "personal" ? undefined : t(`funding.${form.fundingSource}.hint`)}
              >
                <select
                  className="select"
                  value={form.fundingSource}
                  onChange={(event) => patch({ fundingSource: event.target.value as FundingKind })}
                >
                  {FUNDING_SOURCES.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {t(`funding.${option.kind}`)}
                    </option>
                  ))}
                </select>
              </Field>
              {/* Shown only where it means something. A "who pays" box beside
                  "paid by me" is a control that is irrelevant the moment it
                  appears, and this editor already has enough of those. */}
              {form.fundingSource === "other" && (
                <Field label={t("funding.fundedBy")} hint={t("funding.fundedBy.hint")}>
                  <input
                    className="input"
                    placeholder={t("activity.dad")}
                    value={form.fundedBy}
                    onChange={(event) => patch({ fundedBy: event.target.value })}
                  />
                </Field>
              )}
            </FieldGroup>


            <FieldGroup title={t("activities.groupRecurrence")}>
              <Field label={t("activity.recurrenceType")}>
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
              <Field label={t("activity.every")}>
                <input
                  className="input"
                  type="number"
                  min="1"
                  required
                  aria-label={t("activity.recurrenceInterval")}
                  value={form.recurrenceInterval}
                  onChange={(event) => patch({ recurrenceInterval: Number(event.target.value) })}
                />
              </Field>
              <Field label={t("activity.costModel")} name="costModel" span hint={t(COST_MODELS.find((model) => model.value === form.costModel)?.hintKey ?? "activity.modelAuto")}>
                <select
                  className="select"
                  value={form.costModel}
                  onChange={(event) => patch({ costModel: event.target.value as CostModel })}
                >
                  {COST_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>
                      {t(model.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>
            </FieldGroup>

            {/* Instalments, and only for somebody who chose them.

                Three numbers and a date, arranged so the arithmetic is visible
                rather than demanded: type the count and either figure, and the
                other is derived beneath. Only one of the two is stored — a pair
                of numbers that must agree is a pair that will one day
                disagree — and the plan is restated in a sentence so nobody has
                to multiply in their head to check they meant it. */}
            {form.costModel === "installments" && (
              <FieldGroup title={t("activity.modelInstallments")}>
                <Field label={t("activity.installmentCount")}>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="3"
                    value={form.installmentCount}
                    onChange={(event) => patch({ installmentCount: event.target.value })}
                  />
                </Field>
                <Field label={t("activity.installmentAmount")}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="1000"
                    value={form.installmentAmount}
                    onChange={(event) => patch({ installmentAmount: event.target.value })}
                  />
                </Field>
                <Field label={t("activity.installmentTotal")} hint={t("activity.installmentTotalHint")}>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="3000"
                    value={installmentTotalField}
                    onChange={(event) => {
                      /*
                       * Typing the total sets the per-payment figure, because
                       * that is the one that is stored. Somebody who knows a
                       * course costs €3,000 in three payments should not have
                       * to work out that each is €1,000.
                       */
                      const count = Number(form.installmentCount);
                      const total = Number(event.target.value);
                      if (Number.isFinite(count) && count > 0 && Number.isFinite(total)) {
                        patch({ installmentAmount: String(total / count) });
                      }
                    }}
                  />
                </Field>
                <Field label={t("activity.installmentFrequency")}>
                  <select
                    className="select"
                    value={form.installmentFrequency}
                    onChange={(event) =>
                      patch({ installmentFrequency: event.target.value as ActivityDraft["installmentFrequency"] })
                    }
                  >
                    <option value="monthly">{t("cadence.monthly")}</option>
                    <option value="yearly">{t("cadence.yearly")}</option>
                    <option value="custom">{t("recurrence.custom")}</option>
                  </select>
                </Field>
                {form.installmentFrequency === "custom" && (
                  <Field label={t("activity.installmentInterval")}>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      placeholder="42"
                      value={form.installmentIntervalDays}
                      onChange={(event) => patch({ installmentIntervalDays: event.target.value })}
                    />
                  </Field>
                )}
                <Field label={t("activity.installmentFirst")} span hint={t("activity.installmentFirstHint")}>
                  <input
                    className="input"
                    type="date"
                    value={form.nextRenewalDate}
                    onChange={(event) => patch({ nextRenewalDate: event.target.value })}
                  />
                </Field>
                {installmentSummary && <p className="text-note settings-note">{installmentSummary}</p>}
              </FieldGroup>
            )}

            {form.costModel === "perSession" && (
              <FieldGroup title={t("activities.groupSessions")}>
                <Field label={t("activity.sessionsPerMonth")}>
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
              <FieldGroup title={t("activity.sessionsAndPayments")}>
                <Field label={t("activity.pricePerSession")} name="pricePerSession">
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
                <Field label={t("activities.groupSessions")} name="sessions" group hint={t("activity.howOftenTheActivityHappens")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="2"
                      aria-label={t("activity.sessionsPerPeriod")}
                      value={form.sessionsPerPeriod}
                      onChange={(event) => patch({ sessionsPerPeriod: event.target.value })}
                      style={{ minWidth: 0 }}
                    />
                    {/* The word "per" used to sit loose between the two
                        controls, in English, in every language. It belongs
                        inside the option — where a translation can put it
                        wherever its own grammar wants it. */}
                    <select
                      className="select"
                      aria-label={t("activity.sessionFrequencyUnit")}
                      value={form.sessionPeriod}
                      onChange={(event) => patch({ sessionPeriod: event.target.value as "week" | "month" })}
                      style={{ width: "auto" }}
                    >
                      <option value="week">{t("activity.perWeekUnit")}</option>
                      <option value="month">{t("activity.perMonthUnit")}</option>
                    </select>
                  </div>
                </Field>
                <Field label={t("activity.payAfter")} name="sessionsPerPayment" hint={t("activity.sessionsBoughtAtOnce")}>
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
                <Field label={t("activity.onePayment")} span group hint={packSummary.hint}>
                  <output className="text-callout" style={{ fontWeight: 600 }}>
                    {packSummary.amount}
                  </output>
                </Field>
              </FieldGroup>
            )}

            {form.costModel === "fixedYearly" && (
              <FieldGroup title={t("activity.yearlyCharge")}>
                <Field label={t("activity.amountPerYear")} emphasised>
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
                  label={t("activity.monthlyEquivalent")}
                  group
                  hint={t("activity.shownForComparisonOnlyYou")}
                >
                  <output className="text-callout" style={{ fontWeight: 600 }}>
                    {yearlySummary.monthly}
                  </output>
                </Field>
                <Field label={t("activity.nextCharges")} span group hint={yearlySummary.hint}>
                  <output className="text-callout">{yearlySummary.dates}</output>
                </Field>
              </FieldGroup>
            )}

            {form.costModel === "schedule" && (
              <FieldGroup title={t("activity.schedule")}>
                <Field label={t("activity.weekdays")} span group>
                  <div role="group" aria-label={t("activity.weekdays")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                <Field label={t("activity.dayOfMonth")} hint={t("activity.usedWhenNoWeekdayIs")}>
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
                <Field label={t("activity.startsOn")} hint={t("activity.occurrencesBeforeThisDateAre")}>
                  <input
                    className="input"
                    type="date"
                    value={form.startDate}
                    onChange={(event) => patch({ startDate: event.target.value })}
                  />
                </Field>
              </FieldGroup>
            )}

            <FieldGroup title={t("activities.groupPrices")}>
              {relevantPrice("pricePerMonth") && (
              <Field label={t("activity.monthlyCost")} name="pricePerMonth" emphasised={form.costModel === "fixed"}>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    placeholder="—"
                    value={form.pricePerMonth}
                    onChange={(event) => patch({ pricePerMonth: event.target.value })}
                  />
                </Field>
              )}
              {relevantPrice("pricePerSession") && (
              <Field
                  label={t("activity.sessionCost")}
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
              )}
              {relevantPrice("pricePerPurchase") && (
              <Field label={t("activity.purchaseCost")} emphasised={form.recurrenceType === "purchase"}>
                  <input
                    className="input"
                    type="number"
                    step="any"
                    placeholder="—"
                    value={form.pricePerPurchase}
                    onChange={(event) => patch({ pricePerPurchase: event.target.value })}
                  />
                </Field>
              )}
              {relevantPrice("yearlyEstimate") && (
              <Field
                  label={t("activity.yearlyEstimate")}
                  emphasised={form.recurrenceType === "yearly" || form.costModel === "fixedYearly"}
                  hint={form.costModel === "fixedYearly" ? t("activity.sameAsYearlyCharge") : undefined}
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
              )}
            </FieldGroup>

            {/* The prices this model does not read, and the fallback the
                automatic model uses when none of them is filled in. */}
            <AdvancedFields label={t("activity.otherPrices")}>
              <FieldGroup title={t("activity.otherPrices")}>
                {!relevantPrice("pricePerMonth") && (
              <Field label={t("activity.monthlyCost")} name="pricePerMonth" emphasised={form.costModel === "fixed"}>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      placeholder="—"
                      value={form.pricePerMonth}
                      onChange={(event) => patch({ pricePerMonth: event.target.value })}
                    />
                  </Field>
                )}
                {!relevantPrice("pricePerSession") && (
              <Field
                    label={t("activity.sessionCost")}
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
                )}
                {!relevantPrice("pricePerPurchase") && (
              <Field label={t("activity.purchaseCost")} emphasised={form.recurrenceType === "purchase"}>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      placeholder="—"
                      value={form.pricePerPurchase}
                      onChange={(event) => patch({ pricePerPurchase: event.target.value })}
                    />
                  </Field>
                )}
                {!relevantPrice("yearlyEstimate") && (
              <Field
                    label={t("activity.yearlyEstimate")}
                    emphasised={form.recurrenceType === "yearly" || form.costModel === "fixedYearly"}
                    hint={form.costModel === "fixedYearly" ? t("activity.sameAsYearlyCharge") : undefined}
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
                )}
              <Field label={t("activity.estimatedCost")} hint={t("activity.fallbackUsedByTheAutomatic")}>
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
            </AdvancedFields>

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
              <div className="text-footnote">{t("activity.liveEstimate")}</div>
              {/* Named for the verification harness: the figures in here are
                  the ones a cost model exists to get right. */}
              <div className="text-callout activity-estimate-headline" style={{ fontWeight: 600, wordBreak: "break-word" }}>
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
                t(
                  form.costModel === "sessionPack"
                    ? "activities.nextPayment"
                    : form.costModel === "fixedYearly"
                      ? "activities.renewalDate"
                      : "activities.nextRenewal",
                )
              }
            >
              <Field
                label={t(form.costModel === "sessionPack" ? "activities.nextPaymentFallsOn" : "activities.renewsOn")}
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
                <Field label={t("activity.then")} span group hint={t("activity.everyPaymentAfterThatFrom")}>
                  <output className="text-callout">{packDates}</output>
                </Field>
              )}
              {form.nextRenewalDate && form.costModel !== "sessionPack" && form.costModel !== "fixedYearly" && (
                <Field label={t("activity.clearIt")} group>
                  <Button type="button" variant="ghost" size="sm" onClick={() => patch({ nextRenewalDate: "" })}>
                    {t("activity.useTheScheduleInstead")}
                  </Button>
                </Field>
              )}
            </FieldGroup>

            {/* How it looks, put away.

                Colour and icon opened the editor — eleven swatches and an
                icon library, above the question of what the thing costs. They
                are worth having and they are never the reason somebody opened
                this sheet. */}
            <AdvancedFields label={t("activity.appearance")}>
              <FieldGroup title={t("activity.appearance")}>
                <Field label={t("activity.colour")} span group>
                  <ColorPicker value={form.color || undefined} onChange={(color) => patch({ color: color ?? "" })} />
                </Field>
              </FieldGroup>
              {/* The same icon controls the wishlist uses, from the same
                  module: a library icon and a live preview in view, an image
                  link and a site to take the icon from one tap behind. */}
              <MarkFields
                source={{ icon: form.icon, iconUrl: form.iconUrl, sourceUrl: form.iconSourceUrl }}
                accent={draftAccent || "var(--accent)"}
                fallback={<Circle size={20} color={draftAccent || "var(--accent)"} />}
                sourceLabel={t("activity.iconFromAWebsite")}
                sourcePlaceholder="navigraph.com"
                sourceHint={t("activity.theDeveloperPublisherOrClub")}
                onChange={(next) =>
                  patch({
                    ...(next.icon !== undefined ? { icon: next.icon } : {}),
                    ...(next.iconUrl !== undefined ? { iconUrl: next.iconUrl } : {}),
                    ...(next.sourceUrl !== undefined ? { iconSourceUrl: next.sourceUrl } : {}),
                  })
                }
              />
            </AdvancedFields>

            <AdvancedFields label={t("activity.seasonNotesAndVisibility")}>
            <FieldGroup title={t("activities.groupDetails")}>
              <Field label={t("activity.seasonalTag")} hint={t("activity.eGSummerWinterNormal")}>
                <input
                  className="input"
                  placeholder={t("activity.normal")}
                  value={form.seasonalTag}
                  onChange={(event) => patch({ seasonalTag: event.target.value })}
                />
              </Field>
              <Field label={t("activity.notes")} span>
                <input
                  className="input"
                  placeholder={t("activity.anythingWorthRemembering")}
                  value={form.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              </Field>
              <Field label={t("activity.status")} span group>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <label className="text-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={form.active} onChange={(event) => patch({ active: event.target.checked })} />
                    {t("activity.activeCountsTowardTheBudget")}
                  </label>
                  <label className="text-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={form.visible} onChange={(event) => patch({ visible: event.target.checked })} />
                    {t("activity.visibleInSummaries")}
                  </label>
                </div>
              </Field>
            </FieldGroup>

            </AdvancedFields>
          </form>
          </EditorSheet>
        )}
      </Section>

      {/* The financial overview.

          Five figures that answer five different questions, and the point of
          the whole section is that the last one is *not* the first divided by
          twelve: "required in September" is the payments that genuinely fall
          in September, and an activity whose payment month is unknown is
          excluded from it and named underneath instead. */}
      {summary.items.length > 0 && (
        <ActivitySummary summary={summary} monthLabel={monthLabel} money={baseMoney} t={t} />
      )}

      {activities.length === 0 ? (
        <EmptyState title={t("activities.empty")} description={t("activities.emptyBody")} />
      ) : visibleActivities.length === 0 ? (
        <EmptyState title={t("activities.noMatches")} description={t("activities.noMatchesBody")} />
      ) : (
        <div className="item-list">
          {visibleActivities.map((activity) => {
            const accent = activity.color || categoryColour(activity.categoryId);
            const estimate = estimateMap.get(activity.id);
            const due = dueByActivity.get(activity.id);
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
                /* Two independent facts, two channels. The funding state
                   colours the identifying text and the figure; the category
                   colours the outline. Somebody should be able to read *what
                   it is* and *who pays for it* without the two competing. */
                data-funding={activityFundingKind(activity)}
                // The whole card opens the editor, so the small icon buttons
                // stop being the only way in — they are a poor target on a
                // phone and easy to miss entirely.
                role={mutable ? "button" : undefined}
                tabIndex={mutable ? 0 : undefined}
                aria-label={mutable ? t("a11y.editActivity", { name: activity.name }) : undefined}
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
                  /*
                   * The category, as an outline around the whole card.
                   *
                   * It used to be a tinted background plus a heavy left edge.
                   * The tint had to go: with the funding state now colouring
                   * the name and the figure, a coloured ground underneath them
                   * is two colours competing for the same job and a readability
                   * problem in the bargain. An outline says "this is a Health
                   * activity" without touching anything the text sits on.
                   *
                   * `--category-accent` rather than a literal, so the outline
                   * and everything else keyed to the category are one value.
                   */
                  "--category-accent": accent ?? "var(--border)",
                  background: "var(--bg-elevated)",
                } as React.CSSProperties}
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
                    <div
                      className="text-callout"
                      style={{ fontWeight: 600, wordBreak: "break-word", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                    >
                      {activity.name}
                      {!activity.visible && (
                        <EyeOff size={13} aria-label={t("activities.hide")} style={{ verticalAlign: "-2px" }} />
                      )}
                      {/* Deactivated is a financial state, so it is a word on
                          the card rather than a faded row somebody has to
                          infer. */}
                      {!activity.active && <span className="badge badge-neutral">{t("activities.deactivated")}</span>}
                      {/* Who pays, as a state rather than as a label.

                          This was a pill reading "◆ Paid by other · Dad" —
                          twenty-odd characters of chrome beside a name, on a
                          row whose job is to say what the activity is and what
                          it costs. The same fact is now carried by the glyph
                          here and by the colour of the figure on the right,
                          which is the number the classification actually
                          changes the meaning of. The words are in the
                          accessible name and in the mark's own tooltip. */}
                      {activityFundingKind(activity) !== "personal" && (
                        <FundingMark kind={activityFundingKind(activity)} variant="glyph" />
                      )}
                    </div>
                    {/* One meta line, not three.
                        It was: the cadence sentence, then the category, then
                        what falls due — three stacked lines under every name,
                        for facts that fit on one. The cadence is a shape, the
                        category is a word, and the due state keeps its own
                        colour because it is the only part that changes with
                        the month. */}
                    <div className="activity-meta">
                      <CadenceMark cadence={activityCadence(activity)} />
                      <span className="activity-meta-category">{categoryName(activity.categoryId)}</span>
                      {/* The schedule, one press away.

                          This was printed on the row: "≈ 8.86 in August · 2 /
                          week · pay every 10 sessions (≈ every 5 weeks)". It
                          is a real answer to a question somebody asks once,
                          and it was on a line they read every time they came
                          to see what their activities cost. */}
                      {describeActivity(activity, year, month, t, monthNames()) && (
                        <InfoDot label={t("activities.scheduleDetail", { name: activity.name })}>
                          <strong>{activity.name}</strong>
                          {activityFundingKind(activity) !== "personal" && (
                            <div data-funding={activityFundingKind(activity)} className="info-funding">
                              {t(`funding.${activityFundingKind(activity)}.short`)}
                              {fundedByName(activity) ? ` · ${fundedByName(activity)}` : ""}
                              {" — "}
                              {t(`funding.${activityFundingKind(activity)}.hint`)}
                            </div>
                          )}
                          <div>{describeActivity(activity, year, month, t, monthNames())}</div>
                          {activity.seasonalTag && activity.seasonalTag !== "normal" && (
                            <div className="text-caption">{activity.seasonalTag}</div>
                          )}
                        </InfoDot>
                      )}
                      {/* What this month actually requires from this activity —
                          which for eleven months of a yearly subscription is
                          nothing, and for an activity with no known date is
                          neither nothing nor a guess. */}
                      {due && (
                        <span
                          className="activity-due"
                          data-status={due.status}
                          title={due.status === "not-due" ? t("activities.notDueThisMonth") : undefined}
                        >
                          <CalendarClock size={12} aria-hidden="true" />
                          {/* "Nothing due this month" was a column of the same
                              five words down a list where most rows are not due
                              in most months. What is worth reading is the row
                              that *is* — so the quiet case keeps its glyph, its
                              tooltip and its accessible name, and gives up its
                              line. */}
                          {due.status === "unknown" && due.unknownReason && (
                            /* Amber, and it explains itself when asked.

                               This activity's cost is in no month's total,
                               which changes what the figure above means — so
                               it is the one row state that draws attention to
                               itself, and it does so with a mark rather than
                               with a paragraph in a box at the top of the
                               tab. */
                            <InfoDot tone="warning" label={t("activities.whyNoDate", { name: activity.name })}>
                              <strong>{t("activities.dateUnknown")}</strong>
                              <div>{t(due.unknownReason)}</div>
                            </InfoDot>
                          )}
                          <span className={due.status !== "due" ? "sr-only" : undefined}>
                            {due.status === "unknown"
                              ? t("activities.dateUnknown")
                              : due.status === "not-due"
                                ? t("activities.notDueThisMonth")
                                : due.datesKnown && due.dueDates.length > 0
                                  ? `${baseMoney(due.dueBase)} · ${t("activities.dueOn", {
                                      date: formatDate(due.dueDates[0], { day: "numeric", month: "short" }),
                                    })}`
                                  : `${baseMoney(due.dueBase)} · ${t("activities.dueThisMonth")}`}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
                  {/* The figure carries the funding state, because the figure
                      is what the classification changes the meaning of: this
                      amount is money the reader will not be spending. */}
                  <div className="activity-amount" data-funding={activityFundingKind(activity)} style={{ textAlign: "right", minWidth: 0 }}>
                    <strong style={{ whiteSpace: "nowrap" }}>
                      {formatMoney(estimate?.monthlyNative ?? 0, activity.currency, snapshot.settings.currencyDisplayMode)}
                      {/* An annual charge divided by twelve is an average, not
                          a payment. Labelling it "/month" like a subscription
                          invites someone to look for a charge that never
                          arrives. */}
                      <span className="text-caption">
                        {isAveragedMonthly(activity) ? ` ${t("common.perMonthAverage")}` : ` ${t("common.perMonth")}`}
                      </span>
                    </strong>
                    <div className="text-caption" style={{ whiteSpace: "nowrap" }}>
                      {/* An instalment plan has a total, not a yearly cost.
                          "€3,000 /year" for a course paid over three months is
                          an annual commitment the reader does not have; the
                          figure they mean when they say what it costs is the
                          total, and it is labelled as one. */}
                      {formatMoney(estimate?.yearlyNative ?? 0, activity.currency, snapshot.settings.currencyDisplayMode)}{" "}
                      {activity.costModel === "installments" ? t("activity.installmentTotal") : t("common.perYear")}
                    </div>
                    {/* The equivalent in the currency every total on this tab
                        is already in.

                        An activity priced in dollars showed only dollars,
                        beside a summary in euros — so the one figure on the
                        row that could be compared with the budget was the one
                        the reader had to convert in their head. `Money` does
                        this for a transaction; nothing did it here. */}
                    {(() => {
                      const equivalent = displayEquivalent(
                        estimate?.monthlyNative ?? 0,
                        activity.currency,
                        snapshot.settings,
                      );
                      if (!equivalent) return null;
                      return (
                        <div className="money-secondary" style={{ whiteSpace: "nowrap" }}>
                          <span aria-hidden="true">≈ </span>
                          <span className="sr-only">{t("common.approximately")} </span>
                          {formatMoney(equivalent.amount, equivalent.currency, snapshot.settings.currencyDisplayMode)}
                          <span className="text-caption">
                            {" "}
                            {isAveragedMonthly(activity) ? t("common.perMonthAverage") : t("common.perMonth")}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  {mutable && (
                    <div className="row-actions">
                      {/* One visible action, and one door to the rest.

                          This row used to carry six buttons — up, down,
                          deactivate, duplicate, edit, delete — every one of
                          them, on every row, always. Editing is the thing
                          people come here to do; reordering and deleting are
                          things they do occasionally, and an occasional action
                          is worth one press. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => begin(activity)}
                        aria-label={t("a11y.editActivity", { name: activity.name })}
                        title={t("common.edit")}
                      >
                        <Pencil size={15} />
                      </Button>
                      <RowMenu
                        label={t("a11y.moreActions", { name: activity.name })}
                        items={[
                          {
                            id: "deactivate",
                            label: activity.active ? t("activities.deactivate") : t("activities.reactivate"),
                            icon: <Power size={15} />,
                            title: t("activities.deactivateHint"),
                            onSelect: () => toggleActive(activity),
                          },
                          {
                            id: "duplicate",
                            label: t("common.duplicate"),
                            icon: <Copy size={15} />,
                            onSelect: () => duplicate(activity.id),
                          },
                          ...(canReorder
                            ? [
                                {
                                  id: "up",
                                  label: t("common.moveUp"),
                                  icon: <ArrowUp size={15} />,
                                  disabled: orderIndex <= 0,
                                  onSelect: () => move(activity, -1),
                                },
                                {
                                  id: "down",
                                  label: t("common.moveDown"),
                                  icon: <ArrowDown size={15} />,
                                  disabled: orderIndex < 0 || orderIndex >= orderedAll.length - 1,
                                  onSelect: () => move(activity, 1),
                                },
                              ]
                            : []),
                          {
                            id: "delete",
                            label: t("common.delete"),
                            icon: <Trash2 size={15} />,
                            destructive: true,
                            onSelect: () => confirmDelete(activity),
                          },
                        ]}
                      />
                    </div>
                  )}
                </div>
              </div>
              </SwipeRow>
            );
          })}
          {/* Only the marks this list actually uses. A reader whose activities
              are all their own, all monthly, sees no legend at all. */}
          <MarkLegend
            funding={visibleActivities.map(activityFundingKind)}
            cadences={visibleActivities.map(activityCadence)}
          />
        </div>
      )}
    </div>
  );
};

/**
 * The Activities tab's financial overview.
 *
 * Five figures, deliberately in this order:
 *
 *  1. **Total activity cost** — gross, whoever pays. The honest headline: what
 *     your commitments cost the world.
 *  2. **Your budget** — only "paid by me". The figure that actually competes
 *     with your monthly budget.
 *  3. **Paid by other** and 4. **Outside budget** — the two exclusions, kept
 *     apart because they answer different questions.
 *  5. **Required in <month>** — the payments that genuinely fall due in the
 *     month being viewed, from real dates. An annual subscription appears here
 *     once a year, not every month, and one whose renewal date is unknown does
 *     not appear at all; it is named underneath instead.
 *
 * Each figure carries both a monthly and a yearly reading, and every one of
 * them comes from `activityBudgetSummary` — this component does no arithmetic.
 */
const ActivitySummary: React.FC<{
  summary: ReturnType<typeof activityBudgetSummary>;
  monthLabel: string;
  money: (value: number | null | undefined) => string;
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string;
}> = ({ summary, monthLabel, money, t }) => {
  const shares = fundingShares(summary.yearly);
  const required = summary.requiredThisMonth;

  return (
    <section className="activity-summary" aria-label={t("activities.summaryTitle")}>
      <h2 className="text-title activity-summary-title">{t("activities.summaryTitle")}</h2>

      {/* Who pays for it, drawn.
          A length is read in less time than three percentages are, and it can
          only mean one thing — where "43.0% of the total" on a column headed
          PAID BY OTHER read, to the person who asked for this pass, exactly
          like the personal-share statistic it is not. */}
      {summary.yearly.gross > 0 && (
        <div
          className="funding-bar"
          role="img"
          aria-label={FUNDING_KINDS.map(
            (kind) =>
              `${t(`funding.${kind}.short`)} ${shares[kind] != null ? `${shares[kind]!.toFixed(0)}%` : "0%"}`,
          ).join(", ")}
        >
          {FUNDING_KINDS.filter((kind) => (shares[kind] ?? 0) > 0).map((kind) => (
            <span
              key={kind}
              className="funding-bar-part"
              data-funding={kind}
              style={{ width: `${shares[kind]}%` }}
              title={`${t(`funding.${kind}.short`)} · ${shares[kind]!.toFixed(1)}%`}
            >
              {/* The glyph rides inside its own segment, so the split survives
                  a greyscale screenshot and a colour-blind reader. */}
              <span aria-hidden="true">{FUNDING_META[kind].glyph}</span>
              {(shares[kind] ?? 0) >= 12 && <span className="funding-bar-value">{shares[kind]!.toFixed(0)}%</span>}
            </span>
          ))}
        </div>
      )}

      <div className="activity-summary-grid">
        {/* The captions carry data now, not explanation. "Every active
            activity, whoever pays" and "the payments that actually fall due
            this month" were true and were read once; they moved into the
            labels' tooltips, where they are available to anyone who wonders
            and invisible to everyone who does not. */}
        <div className="activity-summary-figure activity-summary-gross">
          <div className="text-footnote" title={t("activities.totalCostHint")}>
            {t("activities.totalCost")}
          </div>
          <div className="money activity-summary-value"><Total amount={summary.monthly.gross} /></div>
          <div className="text-caption">
            {money(summary.yearly.gross)} {t("common.perYear")}
          </div>
        </div>

        {/* The percentages moved into the bar above.
            Each column used to end "· 43.0% of the total", which raised the
            question the bar answers at a glance and left it ambiguous besides:
            two different statistics on this page said "of the total" and meant
            two different wholes. The bar is the split; the columns are the
            money. */}
        {FUNDING_KINDS.map((kind) => (
          <div key={kind} className="activity-summary-figure" data-funding={kind}>
            <div className="text-footnote">
              <span aria-hidden="true" className="funding-glyph">
                {FUNDING_META[kind].glyph}
              </span>{" "}
              {t(`funding.${kind}.short`)}
            </div>
            <div className="money activity-summary-value">{money(summary.monthly[kind])}</div>
            <div className="text-caption">
              {money(summary.yearly[kind])} {t("common.perYear")}
            </div>
          </div>
        ))}

        {/* The figure this whole module exists for. Its caption names the
            month so it can never be mistaken for a monthly average. */}
        <div className="activity-summary-figure activity-summary-required">
          <div className="text-footnote" title={t("activities.requiredThisMonthHint")}>
            {t("activities.requiredThisMonth", { month: monthLabel })}
          </div>
          <div className="money activity-summary-value"><Total amount={required.personal} /></div>
          <div className="text-caption">
            {required.gross !== required.personal
              ? `${money(required.gross)} ${t("funding.gross").toLowerCase()}`
              : "\u00A0"}
          </div>
        </div>
      </div>

      {/* The list of activities with no known payment date used to be here, as
          a boxed note with a heading, a sentence and a bullet per activity —
          the tallest thing on the tab, restating a fact each affected row can
          carry itself. The rows now carry an amber mark that explains itself
          when it is asked to, and the count stays only as a quiet line so the
          figure above is not silently short. */}
      {summary.unscheduled.length > 0 && (
        <p className="text-caption activity-summary-inactive">
          {t("activities.unscheduled", { count: summary.unscheduled.length })}
        </p>
      )}

      {summary.inactiveCount > 0 && (
        <p className="text-caption activity-summary-inactive">
          {t("activities.inactive", { count: summary.inactiveCount })}
        </p>
      )}
    </section>
  );
};

/**
 * One-line summary of how an activity recurs and what drives its price.
 *
 * Built from keys with named values rather than by concatenation: the pieces
 * are a schedule, a count and a month, and every language puts them in its own
 * order. The translator comes in as an argument because this is a module-level
 * helper, not a component.
 *
 * It no longer ends with the activity's state. Every line read "· active", on
 * every row, for ever — a word that is true of all but a handful of rows and
 * says nothing about any of them. The handful it *is* about carry a
 * "Deactivated" badge beside their name, which is where a state belongs.
 */
function describeActivity(activity: Activity, year: number, month: number, t: Translator, months: string[]): string {
  const model = activity.costModel ?? "auto";
  const monthLabel = months[month - 1] ?? String(month);

  if (model === "schedule" && hasSchedule(activity)) {
    return t("activity.summarySchedule", {
      schedule: describeSchedule(activity, t),
      count: occurrencesInMonth(activity, year, month),
      month: monthLabel,
    });
  }
  if (model === "installments") {
    /*
     * The plan, in one sentence: how many payments, of what, to what total.
     * The row's own figure is what the *month* wants; this is what the whole
     * thing costs, and the two are different numbers that both matter.
     */
    const count = activity.installmentCount ?? 0;
    const amount = activity.installmentAmount ?? 0;
    return t("activity.installmentPlan", {
      count,
      amount: formatMoney(amount, activity.currency, "symbol"),
      total: formatMoney(count * amount, activity.currency, "symbol"),
    });
  }
  if (model === "perSession") {
    return t("activity.summaryPerSession", { count: activity.sessionsPerMonth ?? 0 });
  }
  if (model === "sessionPack") {
    // Both facts, in that order: what happens, and what is paid. The card is
    // the one place someone glances at rather than reads, so it must not leave
    // the impression that a €200 charge lands twice a week.
    const sessions = sessionsInMonth(activity, year, month);
    const cycle = describePaymentCycle(activity, t) ?? t("activity.summaryPack");
    // No key for the bare cycle: a "translation" whose whole value is
    // `{cycle}` is a pass-through, and the test that forbids fragments is
    // right to reject it.
    return sessions == null
      ? cycle
      : t("activity.summaryPackWithCount", {
          // A string, deliberately: the count can be fractional ("8.67 in
          // August") and the plural rule must not fire on a rounded integer.
          sessions: trimNumber(sessions),
          month: monthLabel,
          cycle,
        });
  }
  /*
   * Nothing, where the mark beside it has already said it.
   *
   * "billed once a year" next to a yearly icon, "fixed monthly" next to a
   * monthly one, "Monthly · every 1" next to either — the same fact twice, on
   * every row of the list. What survives is only what the shape cannot carry:
   * a count, a schedule, a payment cycle, an interval that is not one.
   */
  if (model === "fixedYearly" || model === "fixed") return "";
  const interval = activity.recurrenceInterval;
  if (!interval || interval === 1) return "";
  return t("activity.summaryEvery", {
    interval,
    recurrence: t(`recurrence.${activity.recurrenceType}`).toLowerCase(),
  });
}

/**
 * A number with at most two decimals, in the reader's own punctuation.
 *
 * `String(8.86)` put a full stop in the middle of a French sentence otherwise
 * full of commas. `numberLocale()` is the one the language selector set.
 */
function trimNumber(value: number): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return rounded.toLocaleString(numberLocale(), { maximumFractionDigits: 2 });
}

interface Preview {
  headline: string;
  detail: string;
}

/**
 * Prices the in-progress form through the very same functions that price a
 * saved activity, so the preview can never drift from the stored maths.
 *
 * Every sentence is a key with named values. The previous version built them by
 * concatenation — "€20/session × 8 sessions ≈ …" — which cannot be translated
 * into a language that orders those pieces differently, and which is why the
 * estimate was the last part of the editor still in English.
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
  t: Translator,
  months: string[],
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string,
): Preview {
  const activity = draftToActivity(draft, editing);
  const period = { year, month };
  const monthly = monthlyEstimateNative(activity, period);
  const yearly = yearlyEstimateNative(activity, monthly, period);
  const money = (value: number | null | undefined) => formatMoney(value ?? 0, activity.currency, displayMode);
  const monthLabel = months[month - 1] ?? String(month);
  const totals = t("activity.previewTotals", { monthly: money(monthly), yearly: money(yearly) });

  if (!activity.active) {
    return {
      headline: t("activity.previewPaused"),
      detail: t("activity.previewPausedDetail", { totals }),
    };
  }

  switch (activity.costModel ?? "auto") {
    case "perSession": {
      if (activity.pricePerSession == null) return { headline: t("activity.addASessionCostTo"), detail: "" };
      return {
        headline: t("activity.previewPerSession", {
          price: money(activity.pricePerSession),
          count: activity.sessionsPerMonth ?? 0,
          totals,
        }),
        detail: t("activity.sessionsAreAssumedToRepeat"),
      };
    }
    case "schedule": {
      if (!hasSchedule(activity)) return { headline: t("activity.pickWeekdaysOrADay"), detail: "" };
      if (activity.pricePerSession == null && activity.estimatedCost == null) {
        return {
          headline: t("activity.addASessionCostTo"),
          detail: t("activity.previewScheduleOnly", { schedule: describeSchedule(activity, t) }),
        };
      }
      const price = activity.pricePerSession ?? activity.estimatedCost ?? 0;
      const upcoming = nextOccurrences(activity, new Date(), 3)
        .map((date) => formatDate(date, { weekday: "short", day: "numeric", month: "short" }))
        .join(" · ");
      return {
        headline: t("activity.previewSchedule", {
          price: money(price),
          count: occurrencesInMonth(activity, year, month),
          month: monthLabel,
          totals,
        }),
        detail: upcoming
          ? t("activity.previewScheduleNext", { schedule: describeSchedule(activity, t), dates: upcoming })
          : t("activity.previewScheduleOnly", { schedule: describeSchedule(activity, t) }),
      };
    }
    case "fixed": {
      if (activity.pricePerMonth == null) return { headline: t("activity.addAMonthlyCostTo"), detail: "" };
      return {
        headline: t("activity.previewFixed", { price: money(activity.pricePerMonth), totals }),
        detail: t("activity.aFlatAmountWhateverThe"),
      };
    }
    case "sessionPack": {
      const payment = sessionPackPaymentAmount(activity);
      const perPayment = normalizeSessionsPerPayment(activity.sessionsPerPayment);
      if (activity.pricePerSession == null) return { headline: t("activity.addASessionCostTo"), detail: "" };
      if (perPayment == null) {
        return { headline: t("activity.sayHowManySessionsOne"), detail: t("activity.untilThenThisIsPriced") };
      }
      const interval = sessionPackIntervalDays(activity);
      const sessions = sessionsInMonth(activity, year, month);
      return {
        headline: t("activity.previewPack", {
          payment: money(payment),
          count: perPayment,
          totals: t("activity.previewTotalsAverage", { monthly: money(monthly), yearly: money(yearly) }),
        }),
        detail:
          interval == null
            ? t("activity.previewPackDetail")
            : t("activity.previewPackEvery", { interval: describeDays(interval, t) }),
      };
    }
    case "fixedYearly": {
      const amount = fixedYearlyAmount(activity);
      if (amount == null) return { headline: t("activity.addTheYearlyAmountTo"), detail: "" };
      const dates = yearlyPaymentDates(activity, new Date(), 2);
      return {
        headline: t("activity.previewYearly", { yearly: money(amount), monthly: money(amount / 12) }),
        detail:
          dates.length > 0
            ? t("activity.previewYearlyDates", {
                dates: dates.map((date) => formatDate(date, { day: "numeric", month: "long", year: "numeric" })).join(", "),
              })
            : t("activity.previewYearlyNoDate"),
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
      return {
        headline: t("activity.previewAuto", { recurrence: t(`recurrence.${activity.recurrenceType}`), totals }),
        detail:
          activity.recurrenceType === "yearly" ? t("activity.previewAutoYearly") : t("activity.previewAutoOther"),
      };
    }
  }
}

function formatCount(value: number, noun: string): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return `${rounded} ${noun}${rounded === 1 ? "" : "s"}`;
}
