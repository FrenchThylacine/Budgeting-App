import React, { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { monthFromDateInput, todayDateInput, weekFromDateInput, weekYear } from "../../domain/dates";
import { selectedIsoWeekYear } from "../../domain/periods";
import type { CurrencyCode, RecurrenceType, SpendingEntry } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { matchesEntryFilters } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

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
  isPiloting: boolean;
  recurrenceType: RecurrenceType;
}

export const SpendingPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addSpendingEntry);
  const update = useBudgetStore((s) => s.updateSpendingEntry);
  const remove = useBudgetStore((s) => s.removeSpendingEntry);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  const mode = snapshot.settings.selectedPeriodMode;

  const emptyDraft = (): Draft => ({
    amount: "",
    date: today(),
    categoryId: snapshot.categories.find((c) => !c.archived)?.id ?? snapshot.categories[0]?.id ?? "",
    currency: snapshot.settings.baseCurrency,
    note: "",
    source: "personal",
    isPiloting: false,
    recurrenceType: "none",
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SpendingEntry | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

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
      isPiloting: draft.isPiloting,
      // Carried from the form so editing an entry cannot silently reset a
      // recurring transaction to one-off.
      recurrenceType: draft.recurrenceType,
    };

    if (editing) update(editing.id, patch);
    else add({ ...patch, year: Number(draft.date.slice(0, 4)) });
    reset();
  };

  const beginEdit = (entry: SpendingEntry) => {
    setEditing(entry);
    setDraft({
      amount: String(entry.amount),
      date: entry.date,
      categoryId: entry.categoryId,
      currency: entry.currency,
      note: entry.note,
      source: entry.source ?? "personal",
      isPiloting: entry.isPiloting,
      recurrenceType: entry.recurrenceType ?? "none",
    });
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
          <Button variant="primary" onClick={reset} disabled={!mutable}>
            <Plus size={16} /> Add transaction
          </Button>
        }
      >
        {!mutable && <div className="historical-banner">Historical periods are read-only.</div>}

        {mutable && (
          <form
            className="card card-body"
            onSubmit={save}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 12,
              marginBottom: 20,
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
            <input
              className="input"
              aria-label="Note"
              placeholder="Note (optional)"
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
            <label className="text-caption" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={draft.isPiloting}
                onChange={(e) => setDraft({ ...draft, isPiloting: e.target.checked })}
              />{" "}
              Piloting
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="primary" type="submit">
                {editing ? "Save changes" : "Add transaction"}
              </Button>
              {editing && (
                <Button variant="ghost" type="button" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
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
              <div key={entry.id} className="item-row">
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
                  </div>
                  <div className="text-footnote">
                    {entry.date}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
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
                        onClick={() => {
                          if (window.confirm("Delete this transaction?")) remove(entry.id);
                        }}
                        aria-label="Delete transaction"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
