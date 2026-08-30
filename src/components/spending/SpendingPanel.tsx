import React, { useMemo, useState } from "react";
import { Pencil, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { currencyOptionsFor, formatMoney } from "../../domain/currency";
import { Money, Total } from "../ui/Money";
import { CadenceMark } from "../ui/CadenceMark";
import { entryCadence } from "../../domain/cadence";
import { monthFromDateInput, todayDateInput, weekFromDateInput, weekYear } from "../../domain/dates";
import { selectedIsoWeekYear } from "../../domain/periods";
import {
  FUNDING_META,
  FUNDING_SOURCES,
  activityFundingKind,
  entryFundingKind,
  fundingKind,
  isExternallyFunded,
} from "../../domain/funding";
import { fundingSplit } from "../../domain/analytics";
import { findSeedCategory } from "../../domain/seedCategories";
import { useTranslation } from "../../i18n/useTranslation";
import { isActiveWishlistItem, sortWishlistItems } from "../../domain/wishlist";
import { formatDualMoney } from "../../utils/formatters";
import type { WishlistLinkResult } from "../../domain/wishlist";
import type { Activity, CurrencyCode, RecurrenceType, SpendingEntry, WishlistItem } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { matchesEntryFilters } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import { EditorSheet } from "../ui/EditorSheet";
import { SwipeRow } from "../ui/SwipeRow";
import { gesturesFor } from "../../domain/gestures";
import type { SwipeActionId } from "../../domain/types";

const today = () => todayDateInput();

const RECURRENCE_OPTIONS: { value: RecurrenceType; labelKey: string }[] = [
  { value: "none", labelKey: "recurrence.none" },
  { value: "weekly", labelKey: "recurrence.weekly" },
  { value: "monthly", labelKey: "recurrence.monthly" },
  { value: "yearly", labelKey: "recurrence.yearly" },
  { value: "session", labelKey: "activity.perSession" },
  { value: "purchase", labelKey: "recurrence.purchase" },
  { value: "custom", labelKey: "recurrence.custom" },
];


interface Draft {
  amount: string;
  date: string;
  categoryId: string;
  currency: CurrencyCode;
  note: string;
  source: string;
  recurrenceType: RecurrenceType;
  /**
   * The activity this transaction paid for; "" when it stands on its own.
   *
   * Constrained to the selected category — see `activityOptions` below — and
   * cleared rather than silently kept when the category changes underneath it.
   */
  activityId: string;
  /** Wishlist item this transaction fulfils; "" when it stands on its own. */
  wishlistItemId: string;
}

export const SpendingPanel: React.FC = () => {
  const { t, formatDate } = useTranslation();
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addSpendingEntry);
  const update = useBudgetStore((s) => s.updateSpendingEntry);
  const remove = useBudgetStore((s) => s.removeSpendingEntry);
  const recordPurchase = useBudgetStore((s) => s.recordWishlistPurchase);
  const linkToWishlistItem = useBudgetStore((s) => s.linkSpendingToWishlistItem);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  const mode = snapshot.settings.selectedPeriodMode;

  const emptyDraft = (): Draft => ({
    amount: "",
    date: today(),
    categoryId: snapshot.categories.find((c) => !c.archived)?.id ?? snapshot.categories[0]?.id ?? "",
    currency: snapshot.settings.baseCurrency,
    note: "",
    source: "personal",
    recurrenceType: "none",
    activityId: "",
    wishlistItemId: "",
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SpendingEntry | null>(null);
  /** Whether the editor sheet is on screen. Editing implies it. */
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState<string | null>(null);

  const wishlistItems: WishlistItem[] =
    snapshot.years[String(snapshot.settings.selectedYear)]?.wishlistItems ?? [];

  const wishlistById = useMemo(
    () => new Map(wishlistItems.map((item) => [item.id, item])),
    [wishlistItems],
  );

  /**
   * Items offered in the form: everything still waiting to be bought, plus the
   * one this transaction is already linked to — otherwise editing an entry
   * would silently show "no wishlist item" for a link that exists.
   */
  const linkableWishlistItems = useMemo(() => {
    const selectable = wishlistItems.filter(isActiveWishlistItem);
    const current = draft.wishlistItemId ? wishlistById.get(draft.wishlistItemId) : undefined;
    if (current && !selectable.some((item) => item.id === current.id)) selectable.push(current);
    return sortWishlistItems(selectable);
  }, [wishlistItems, wishlistById, draft.wishlistItemId]);

  const activities: Activity[] = snapshot.years[String(snapshot.settings.selectedYear)]?.activities ?? [];
  const activityById = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities]);

  /**
   * The wishlist category, resolved by seed key rather than by name.
   *
   * The wishlist selector belongs to exactly one category, and which category
   * that is has to be a fact the app can look up — matching on the string
   * "Wishlist" would break the moment somebody renamed it, and hardcoding an
   * id broke the moment a second budget existed.
   */
  const wishlistCategoryId = useMemo(
    () => findSeedCategory(snapshot.categories, "cat-wishlist")?.id,
    [snapshot.categories],
  );
  const isWishlistCategory = wishlistCategoryId != null && draft.categoryId === wishlistCategoryId;

  /**
   * Activities inside the selected category.
   *
   * Only these are offered: an activity in another category has nothing to do
   * with this transaction, and offering it is how a padel session ends up
   * filed under Software. The transaction's existing activity stays in the
   * list while it is being edited even if it has since moved category, for the
   * same reason an archived category stays selectable — a `<select>` whose
   * value is not among its options silently shows a different one.
   */
  const activityOptions = useMemo(() => {
    const inCategory = activities
      .filter((activity) => activity.categoryId === draft.categoryId)
      .sort((a, b) => a.order - b.order);
    const current = draft.activityId ? activityById.get(draft.activityId) : undefined;
    if (current && !inCategory.some((activity) => activity.id === current.id)) return [...inCategory, current];
    return inCategory;
  }, [activities, activityById, draft.categoryId, draft.activityId]);

  /**
   * Changing the category re-scopes both selectors and clears a selection the
   * new category cannot hold.
   *
   * Silently keeping an activity that belongs to another category would
   * persist a relationship the interface says is impossible; silently keeping
   * a wishlist link outside the wishlist category would do the same. The user
   * is told, rather than left to notice.
   */
  const changeCategory = (categoryId: string) => {
    setDraft((current) => {
      const next = { ...current, categoryId };
      const keepsActivity =
        !current.activityId || activityById.get(current.activityId)?.categoryId === categoryId;
      if (!keepsActivity) {
        next.activityId = "";
        setNotice(t("spending.activityCleared"));
      }
      if (wishlistCategoryId != null && categoryId !== wishlistCategoryId && current.wishlistItemId) {
        next.wishlistItemId = "";
      }
      return next;
    });
  };

  /** The activity this transaction is attached to, when it has one. */
  const selectedActivity = draft.activityId ? activityById.get(draft.activityId) : undefined;

  /** Everything in the selected period, before the search box narrows it. */
  const periodEntries = useMemo(
    () =>
      Object.values(snapshot.years)
        .flatMap((record) => record.spendingEntries)
        .filter((entry) =>
          mode === "week"
            ? entry.week === snapshot.settings.selectedWeek &&
              weekYear(new Date(`${entry.date}T12:00:00`)) === selectedIsoWeekYear(snapshot.settings)
            : mode === "year"
            ? entry.year === snapshot.settings.selectedYear
            : entry.year === snapshot.settings.selectedYear && entry.month === snapshot.settings.selectedMonth,
        ),
    [mode, snapshot],
  );

  const entries = useMemo(
    () =>
      periodEntries
        .filter((entry) => matchesEntryFilters(entry, { search }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [periodEntries, search],
  );

  /**
   * Who paid for the period — the whole period, not the search results. A
   * total that changes as you type in a filter box is not a total.
   */
  const split = useMemo(() => fundingSplit(periodEntries, snapshot), [periodEntries, snapshot]);

  const reset = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(false);
  };

  /** Open the editor for a new transaction. */
  const beginNew = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  };

  const spendingGestures = gesturesFor(snapshot.settings, "spending");

  const spendingSwipe = (action: SwipeActionId, entry: SpendingEntry) => {
    if (!mutable || action === "none") return [];
    if (action === "delete") {
      return [{ label: t("common.delete"), icon: <Trash2 size={18} />, destructive: true, onAction: () => confirmDelete(entry) }];
    }
    if (action === "edit") {
      return [{ label: t("common.edit"), icon: <Pencil size={18} />, onAction: () => beginEdit(entry) }];
    }
    return [];
  };

  const selectedCategory = snapshot.categories.find((category) => category.id === draft.categoryId);

  /** Turns a refused link into words instead of a silent no-op. */
  const reportLinkResult = (result: WishlistLinkResult, itemName: string): boolean => {
    if (result.status === "already-linked") {
      const other = Object.values(snapshot.years)
        .flatMap((record) => record.spendingEntries)
        .find((entry) => entry.id === result.spendingId);
      setNotice(
        `"${itemName}" is already linked to a transaction${
          other ? ` of ${formatMoney(other.amount, other.currency, snapshot.settings.currencyDisplayMode)} on ${other.date}` : ""
        }. Unlink that one first if this is the real purchase.`,
      );
      return false;
    }
    if (result.status === "locked") {
      setNotice("This period is historical and read-only.");
      return false;
    }
    if (result.status === "not-found") {
      setNotice("That wishlist item no longer exists.");
      return false;
    }
    setNotice(null);
    return true;
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || !draft.categoryId || !draft.date) return;

    const patch = {
      amount,
      date: draft.date,
      month: monthFromDateInput(draft.date),
      week: weekFromDateInput(draft.date),
      categoryId: draft.categoryId,
      // The relationship is persisted, not merely displayed: `activityId` is a
      // real column, so the link survives a save, a reload and a round trip
      // through the server. Empty means "stands on its own", stored as absent
      // rather than as an empty string.
      activityId: draft.activityId || undefined,
      currency: draft.currency,
      note: draft.note,
      source: draft.source,
      // Carried from the form so editing an entry cannot silently reset a
      // recurring transaction to one-off.
      recurrenceType: draft.recurrenceType,
    };

    if (editing) {
      update(editing.id, patch);
      // Only touch the link when it actually changed, so ordinary edits do not
      // rewrite a wishlist item's purchase state.
      const previous = editing.wishlistItemId ?? "";
      if (draft.wishlistItemId !== previous) {
        const result = linkToWishlistItem(editing.id, draft.wishlistItemId || null);
        const name = wishlistById.get(draft.wishlistItemId)?.name ?? t("common.thatItem");
        if (!reportLinkResult(result, name)) return;
      } else {
        setNotice(null);
      }
      reset();
      return;
    }

    if (draft.wishlistItemId) {
      // Same store action the wishlist's own "Buy" button uses, so there is one
      // code path — and one duplicate guard — for both directions.
      const item = wishlistById.get(draft.wishlistItemId);
      const result = recordPurchase(draft.wishlistItemId, {
        amount,
        date: draft.date,
        categoryId: draft.categoryId,
        currency: draft.currency,
        note: draft.note,
        source: draft.source,
        recurrenceType: draft.recurrenceType,
      });
      if (!reportLinkResult(result, item?.name ?? t("common.thatItem"))) return;
      reset();
      return;
    }

    add({ ...patch, year: Number(draft.date.slice(0, 4)) });
    setNotice(null);
    reset();
  };

  const beginEdit = (entry: SpendingEntry) => {
    setNotice(null);
    setOpen(true);
    setEditing(entry);
    setDraft({
      amount: String(entry.amount),
      date: entry.date,
      categoryId: entry.categoryId,
      currency: entry.currency,
      note: entry.note,
      source: entry.source ?? "personal",
      recurrenceType: entry.recurrenceType ?? "none",
      activityId: entry.activityId ?? "",
      wishlistItemId: entry.wishlistItemId ?? "",
    });
  };

  const confirmDelete = (entry: SpendingEntry) => {
    const linkedItem = entry.wishlistItemId ? wishlistById.get(entry.wishlistItemId) : undefined;
    const warning = linkedItem
      ? `\n\n"${linkedItem.name}" will be unlinked from it and stays in your wishlist.`
      : "";
    if (window.confirm(`${t("spending.confirmDelete")}${warning}`)) {
      remove(entry.id);
      setNotice(null);
    }
  };

  // Archived categories stay selectable while editing an entry that already
  // uses one; otherwise the select would silently show a different category
  // than the transaction actually has.
  const categoryOptions = useMemo(() => {
    const active = snapshot.categories.filter((category) => !category.archived);
    const current = snapshot.categories.find((category) => category.id === draft.categoryId);
    if (current && current.archived) return [...active, current];
    return active;
  }, [snapshot.categories, draft.categoryId]);

  return (
    <div className="page-enter" style={{ display: "grid", gap: 24 }}>
      <Section
        title={t("spending.title")}
        action={
          <Button variant="primary" data-action="add-spending" onClick={beginNew} disabled={!mutable}>
            <Plus size={16} /> {t("spending.add")}
          </Button>
        }
      >
        {!mutable && <div className="historical-banner">{t("common.readOnly")}</div>}

        {notice && (
          <div
            role="status"
            className="text-caption"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "8px 12px",
              marginBottom: 12,
              borderRadius: "var(--radius-md)",
              background: "var(--warning-soft)",
              color: "var(--warning-text)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label={t("a11y.dismissMessage")}
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {mutable && open && (
          <EditorSheet
            title={editing ? t("spending.edit") : t("spending.new")}
            subtitle={editing ? "Recorded on " + editing.date : undefined}
            onClose={reset}
            footer={
              <>
                <Button variant="ghost" type="button" onClick={reset}>{t("common.cancel")}</Button>
                <Button variant="primary" type="submit" form="spending-editor-form">
                  {editing ? t("common.save") : t("spending.add")}
                </Button>
              </>
            }
          >
          <form
            id="spending-editor-form"
            onSubmit={save}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))",
              gap: 12,
            }}
          >
            <Field label={t("spending.amount")} name="amount">
              <input
                className="input"
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </Field>
            <Field label={t("spending.currency")} name="currency">
              <select
                className="select"
                value={draft.currency}
                onChange={(e) => setDraft({ ...draft, currency: e.target.value as CurrencyCode })}
              >
                {currencyOptionsFor(snapshot.settings, draft.currency).map((currency) => (
                  <option key={currency}>{currency}</option>
                ))}
              </select>
            </Field>
            <Field label={t("spending.date")} name="date">
              <input
                className="input"
                type="date"
                required
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label={t("spending.category")} name="category">
              <select
                className="select"
                value={draft.categoryId}
                onChange={(e) => changeCategory(e.target.value)}
              >
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label={t("funding.label")}
              name="funding"
              // The consequence of the choice, said where the choice is made.
              // Marking a transaction as someone else's changes the remaining
              // budget the moment it is saved, and that has to be predictable.
              hint={t(`funding.${fundingKind(draft.source)}.hint`)}
            >
              <select
                className="select"
                value={draft.source}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
              >
                {FUNDING_SOURCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(`funding.${option.kind}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("spending.repeats")}>
              <select
                className="select"
                value={draft.recurrenceType}
                onChange={(e) => setDraft({ ...draft, recurrenceType: e.target.value as RecurrenceType })}
              >
                {RECURRENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </Field>
            {/* Activity, or wishlist item — never both, and never the wrong one.

                The editor used to offer a wishlist dropdown on every category,
                which is a control that is irrelevant on nine categories out of
                ten and silently unrelated to the one thing a transaction
                usually pays for: an activity. The selector shown now follows
                the category: the wishlist category gets the wishlist items,
                every other category gets its own activities. */}
            {isWishlistCategory ? (
              <Field
                label={t("spending.wishlistItem")}
                hint={draft.wishlistItemId ? t("spending.wishlistHint") : undefined}
              >
                <select
                  className="select"
                  value={draft.wishlistItemId}
                  onChange={(e) => setDraft({ ...draft, wishlistItemId: e.target.value })}
                >
                  <option value="">{t("spending.wishlistNone")}</option>
                  {linkableWishlistItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.actualPrice != null
                        ? ` · ${formatMoney(item.actualPrice, item.currency, snapshot.settings.currencyDisplayMode)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field
                label={t("spending.activity")}
                hint={
                  activityOptions.length === 0
                    ? t("spending.activityEmpty")
                    : selectedActivity && activityFundingKind(selectedActivity) !== fundingKind(draft.source)
                      ? t("spending.activityFundingHint", {
                          name: selectedActivity.name,
                          funding: t(`funding.${activityFundingKind(selectedActivity)}.short`).toLowerCase(),
                        })
                      : t("spending.activityHint")
                }
              >
                <select
                  className="select"
                  value={draft.activityId}
                  disabled={activityOptions.length === 0}
                  onChange={(e) => {
                    const activityId = e.target.value;
                    const activity = activityId ? activityById.get(activityId) : undefined;
                    setDraft((current) => ({
                      ...current,
                      activityId,
                      /*
                       * The activity's funding becomes this transaction's
                       * default — a lesson your father pays for is normally
                       * paid by him — but only while the user has not chosen
                       * otherwise. The select below stays editable, so an
                       * individual transaction can always override it.
                       */
                      source: activity ? FUNDING_META[activityFundingKind(activity)].value : current.source,
                    }));
                  }}
                >
                  <option value="">{t("spending.activityNone")}</option>
                  {activityOptions.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                      {activity.active ? "" : ` · ${t("activities.deactivated")}`}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t("spending.note")} name="note">
              <input
                className="input"
                placeholder={t("common.optional")}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </Field>
          </form>
          </EditorSheet>
        )}

        <input
          className="input"
          aria-label={t("spending.searchPlaceholder")}
          placeholder={t("spending.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Section>

      {/* What the period cost, and who paid for it.

          Four figures rather than three: the two exclusions are shown
          separately because "somebody else paid for this" and "this is my
          money, kept off this budget" are different facts about a period, and
          a report that adds them together cannot answer either question.

          Shown only when there is something to split. A three-way breakdown of
          one number is noise. */}
      {(split.otherFundedCount > 0 || split.outsideBudgetCount > 0) && (
        <div className="funding-split">
          <div data-funding="personal">
            <div className="text-footnote">
              <span aria-hidden="true" className="funding-glyph">{FUNDING_META.personal.glyph}</span>{" "}
              {t("funding.personal.short")}
            </div>
            <div className="money funding-split-value"><Total amount={split.personal} /></div>
            <div className="text-caption">{t("common.transactions", { count: split.personalCount })}</div>
          </div>
          <div data-funding="other">
            <div className="text-footnote">
              <span aria-hidden="true" className="funding-glyph">{FUNDING_META.other.glyph}</span>{" "}
              {t("funding.other.short")}
            </div>
            <div className="money funding-split-value">{formatDualMoney(split.otherFunded, snapshot.settings)}</div>
            <div className="text-caption">
              {t("common.transactions", { count: split.otherFundedCount })}
            </div>
          </div>
          <div data-funding="outside">
            <div className="text-footnote">
              <span aria-hidden="true" className="funding-glyph">{FUNDING_META.outside.glyph}</span>{" "}
              {t("funding.outside.short")}
            </div>
            <div className="money funding-split-value">
              {formatDualMoney(split.outsideBudget, snapshot.settings)}
            </div>
            <div className="text-caption">
              {t("common.transactions", { count: split.outsideBudgetCount })}
            </div>
          </div>
          <div>
            <div className="text-footnote">{t("funding.gross")}</div>
            <div className="money funding-split-value" style={{ color: "var(--text-secondary)" }}>
              {formatDualMoney(split.transactions, snapshot.settings)}
            </div>
            <div className="text-caption">{t("spending.everythingRecorded", { period: t(`common.${mode}`) })}</div>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title={t("spending.empty", { period: t(`common.${mode}`) })}
          description={t("spending.emptyBody")}
        />
      ) : (
        <div className="item-list">
          {entries.map((entry) => {
            const category = snapshot.categories.find((c) => c.id === entry.categoryId);
            const isRecurring = entry.recurrenceType && entry.recurrenceType !== "none";
            return (
              <SwipeRow
                key={entry.id}
                label={entry.note || category?.name || t("spending.transaction")}
                trailing={spendingSwipe(spendingGestures.trailing, entry)}
                leading={spendingSwipe(spendingGestures.leading, entry)}
              >
              <div
                className={`item-row${mutable ? " editable-row" : ""}`}
                role={mutable ? "button" : undefined}
                tabIndex={mutable ? 0 : undefined}
                aria-label={mutable ? t("spending.editTransaction") : undefined}
                onClick={(event) => {
                  if (!mutable) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("button, a, input, select, textarea")) return;
                  if (window.getSelection()?.toString()) return;
                  beginEdit(entry);
                }}
                onKeyDown={(event) => {
                  if (!mutable || event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    beginEdit(entry);
                  }
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    className="text-callout"
                    style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 99,
                        background: category?.color ?? "var(--text-tertiary)",
                        flexShrink: 0,
                      }}
                    />
                    {category?.name ?? t("common.uncategorised")}
                    {/* The shape, not the enum. This printed the stored value
                        — "monthly", "session" — capitalised by a CSS rule: an
                        internal identifier, in English, on a user's row. */}
                    {isRecurring && <CadenceMark cadence={entryCadence(entry)} />}
                    {/* Which of the two exclusions it is, not merely that it
                        is one. "Paid by other" and "Outside budget" behave the
                        same against the budget and mean different things. */}
                    {isExternallyFunded(entry) && (
                      <span
                        className="funding-badge"
                        data-funding={entryFundingKind(entry)}
                        title={t(`funding.${entryFundingKind(entry)}.hint`)}
                      >
                        <span aria-hidden="true">{FUNDING_META[entryFundingKind(entry)].glyph}</span>
                        {t(`funding.${entryFundingKind(entry)}.short`)}
                      </span>
                    )}
                    {entry.activityId && activityById.get(entry.activityId) && (
                      <span className="badge badge-info" title={t("spending.activity")}>
                        {activityById.get(entry.activityId)!.name}
                      </span>
                    )}
                    {entry.wishlistItemId && (
                      <span
                        className="badge badge-success"
                        style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={t("spending.linkedWishlistItem")}
                      >
                        <ShoppingBag size={11} />{" "}
                        {wishlistById.get(entry.wishlistItemId)?.name ?? t("spending.wishlistItem")}
                      </span>
                    )}
                  </div>
                  <div className="text-footnote">
                    {/* The reader's own date format. It was the stored ISO
                        string — sortable, unambiguous, and not how anybody
                        writes a date. */}
                    {formatDate(entry.date, { day: "numeric", month: "short" })}
                    {entry.note ? <span className="user-text"> · {entry.note}</span> : ""}
                  </div>
                </div>
                {/* The amount sits outside `.row-actions`: that container is
                    hidden on touch, where the swipe replaces the buttons, and
                    the figure is the one thing on the row that must never go. */}
                <div className="row-trailing">
                  {/* The transaction's own currency is the figure; the
                      configured second currency, when there is one and a rate
                      exists, is a smaller line under it. */}
                  <Money amount={entry.amount} currency={entry.currency} strong />
                  {mutable && (
                    <div className="row-actions">
                      <Button variant="ghost" size="sm" icon onClick={() => beginEdit(entry)} aria-label={t("a11y.editTransaction")}>
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => confirmDelete(entry)}
                        aria-label={t("a11y.deleteTransaction")}
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
