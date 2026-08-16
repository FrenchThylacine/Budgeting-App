import React, { useMemo, useState } from "react";
import { Pencil, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { monthFromDateInput, todayDateInput, weekFromDateInput, weekYear } from "../../domain/dates";
import { selectedIsoWeekYear } from "../../domain/periods";
import { isActiveWishlistItem, sortWishlistItems } from "../../domain/wishlist";
import type { WishlistLinkResult } from "../../domain/wishlist";
import type { CurrencyCode, RecurrenceType, SpendingEntry, WishlistItem } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { matchesEntryFilters } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import { EditorSheet } from "../ui/EditorSheet";
import { SwipeRow } from "../ui/SwipeRow";
import { gesturesFor } from "../../domain/gestures";
import type { SwipeActionId } from "../../domain/types";

const today = () => todayDateInput();

const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "none", label: "One-off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "session", label: "Per session" },
  { value: "purchase", label: "Purchase" },
  { value: "custom", label: "Custom" },
];

const SOURCE_OPTIONS = [
  { value: "personal", label: "Budget" },
  { value: "external", label: "Outside budget" },
  { value: "shared", label: "Someone else paid" },
];

interface Draft {
  amount: string;
  date: string;
  categoryId: string;
  currency: CurrencyCode;
  note: string;
  source: string;
  recurrenceType: RecurrenceType;
  /** Wishlist item this transaction fulfils; "" when it stands on its own. */
  wishlistItemId: string;
}

export const SpendingPanel: React.FC = () => {
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

  const entries = useMemo(
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
        )
        .filter((entry) => matchesEntryFilters(entry, { search }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [mode, snapshot, search],
  );

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
      return [{ label: "Delete", icon: <Trash2 size={18} />, destructive: true, onAction: () => confirmDelete(entry) }];
    }
    if (action === "edit") {
      return [{ label: "Edit", icon: <Pencil size={18} />, onAction: () => beginEdit(entry) }];
    }
    return [];
  };

  const selectedCategory = snapshot.categories.find((category) => category.id === draft.categoryId);

  /**
   * Piloting is a property of the category, not a separate switch: a "piloting"
   * bucket says the spend is piloting, and nothing else does. Any other
   * category leaves the question open, so an entry that was already flagged
   * keeps its flag instead of being silently reclassified by an unrelated edit.
   */
  const categorySaysPiloting = selectedCategory?.bucket === "piloting";
  const pilotingForDraft = categorySaysPiloting ? true : (editing?.isPiloting ?? false);

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
      currency: draft.currency,
      note: draft.note,
      source: draft.source,
      isPiloting: pilotingForDraft,
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
        const name = wishlistById.get(draft.wishlistItemId)?.name ?? "That item";
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
        isPiloting: pilotingForDraft,
        recurrenceType: draft.recurrenceType,
      });
      if (!reportLinkResult(result, item?.name ?? "That item")) return;
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
      // `isPiloting` is not a form field: it follows the category, and an
      // existing flag is carried through `editing` so an edit never drops it.
      recurrenceType: entry.recurrenceType ?? "none",
      wishlistItemId: entry.wishlistItemId ?? "",
    });
  };

  const confirmDelete = (entry: SpendingEntry) => {
    const linkedItem = entry.wishlistItemId ? wishlistById.get(entry.wishlistItemId) : undefined;
    const warning = linkedItem
      ? `\n\n"${linkedItem.name}" will be unlinked from it and stays in your wishlist.`
      : "";
    if (window.confirm(`Delete this transaction?${warning}`)) {
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
        title="Spending"
        action={
          <Button variant="primary" onClick={beginNew} disabled={!mutable}>
            <Plus size={16} /> Add transaction
          </Button>
        }
      >
        {!mutable && <div className="historical-banner">Historical periods are read-only.</div>}

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
              color: "var(--warning)",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss message"
              style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0 }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {mutable && open && (
          <EditorSheet
            title={editing ? "Edit transaction" : "New transaction"}
            subtitle={editing ? "Recorded on " + editing.date : undefined}
            onClose={reset}
            footer={
              <>
                <Button variant="ghost" type="button" onClick={reset}>Cancel</Button>
                <Button variant="primary" type="submit" form="spending-editor-form">
                  {editing ? "Save changes" : "Add transaction"}
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
            <input
              className="input"
              aria-label="Amount"
              type="number"
              step="any"
              required
              placeholder="Amount"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            />
            <select
              className="select"
              aria-label="Currency"
              value={draft.currency}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value as CurrencyCode })}
            >
              {CURRENCY_OPTIONS.map((currency) => (
                <option key={currency}>{currency}</option>
              ))}
            </select>
            <input
              className="input"
              aria-label="Date"
              type="date"
              required
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
            <select
              className="select"
              aria-label="Category"
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              {categoryOptions.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
            {/* The category decides whether this counts as piloting; the state
                is shown rather than asked for a second time. */}
            {pilotingForDraft && (
              <span
                className="text-caption"
                style={{ display: "flex", alignItems: "center", color: "var(--text-tertiary)" }}
              >
                {categorySaysPiloting ? "Counts as piloting spend." : "Kept as piloting spend."}
              </span>
            )}
            <select
              className="select"
              aria-label="Payment source"
              value={draft.source}
              onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="select"
              aria-label="Recurrence"
              value={draft.recurrenceType}
              onChange={(e) => setDraft({ ...draft, recurrenceType: e.target.value as RecurrenceType })}
            >
              {RECURRENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
              <select
                className="select"
                aria-label="Wishlist item"
                value={draft.wishlistItemId}
                onChange={(e) => setDraft({ ...draft, wishlistItemId: e.target.value })}
                style={{ minWidth: 0 }}
              >
                <option value="">No wishlist item</option>
                {linkableWishlistItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.actualPrice != null
                      ? ` · ${formatMoney(item.actualPrice, item.currency, snapshot.settings.currencyDisplayMode)}`
                      : ""}
                  </option>
                ))}
              </select>
              {draft.wishlistItemId && (
                <span className="text-caption" style={{ color: "var(--text-tertiary)" }}>
                  {editing ? "Links this transaction and marks the item bought." : "Marks the item bought when saved."}
                </span>
              )}
            </div>
            <input
              className="input"
              aria-label="Note"
              placeholder="Note (optional)"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </form>
          </EditorSheet>
        )}

        <input
          className="input"
          aria-label="Search transactions"
          placeholder="Search notes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Section>

      {entries.length === 0 ? (
        <EmptyState
          title={`No transactions for this ${mode}`}
          description="Add an expense to begin tracking this period."
        />
      ) : (
        <div className="item-list">
          {entries.map((entry) => {
            const category = snapshot.categories.find((c) => c.id === entry.categoryId);
            const isRecurring = entry.recurrenceType && entry.recurrenceType !== "none";
            return (
              <SwipeRow
                key={entry.id}
                label={entry.note || category?.name || "Transaction"}
                trailing={spendingSwipe(spendingGestures.trailing, entry)}
                leading={spendingSwipe(spendingGestures.leading, entry)}
              >
              <div
                className={`item-row${mutable ? " editable-row" : ""}`}
                role={mutable ? "button" : undefined}
                tabIndex={mutable ? 0 : undefined}
                aria-label={mutable ? `Edit transaction` : undefined}
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
                    {category?.name ?? "Uncategorized"}
                    {isRecurring && (
                      <span className="badge badge-info" style={{ textTransform: "capitalize" }}>
                        {entry.recurrenceType}
                      </span>
                    )}
                    {entry.isPiloting && <span className="badge badge-neutral">Piloting</span>}
                    {(entry.source ?? "personal") !== "personal" && (
                      <span className="badge badge-warning">
                        {SOURCE_OPTIONS.find((o) => o.value === entry.source)?.label ?? entry.source}
                      </span>
                    )}
                    {entry.wishlistItemId && (
                      <span
                        className="badge badge-success"
                        style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title="Linked wishlist item"
                      >
                        <ShoppingBag size={11} />{" "}
                        {wishlistById.get(entry.wishlistItemId)?.name ?? "Wishlist item"}
                      </span>
                    )}
                  </div>
                  <div className="text-footnote">
                    {entry.date}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </div>
                <div className="row-actions" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <strong>{formatMoney(entry.amount, entry.currency, snapshot.settings.currencyDisplayMode)}</strong>
                  {mutable && (
                    <>
                      <Button variant="ghost" size="sm" icon onClick={() => beginEdit(entry)} aria-label="Edit transaction">
                        <Pencil size={15} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon
                        onClick={() => confirmDelete(entry)}
                        aria-label="Delete transaction"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </>
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
