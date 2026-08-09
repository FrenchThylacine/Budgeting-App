import React, { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { monthFromDateInput, weekFromDateInput } from "../../domain/dates";
import type { SpendingEntry } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { matchesEntryFilters } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

const today = () => new Date().toISOString().slice(0, 10);

export const SpendingPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addSpendingEntry);
  const update = useBudgetStore((s) => s.updateSpendingEntry);
  const remove = useBudgetStore((s) => s.removeSpendingEntry);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  const record = snapshot.years[String(snapshot.settings.selectedYear)];
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<SpendingEntry | null>(null);
  const [draft, setDraft] = useState({ amount: "", date: today(), categoryId: snapshot.categories[0]?.id ?? "", currency: snapshot.settings.baseCurrency, note: "", source: "personal", isPiloting: false });

  const entries = useMemo(() => (record?.spendingEntries ?? [])
    .filter((entry) => entry.month === snapshot.settings.selectedMonth)
    .filter((entry) => matchesEntryFilters(entry, { search }))
    .sort((a, b) => b.date.localeCompare(a.date)), [record, snapshot.settings.selectedMonth, search]);

  const reset = () => { setEditing(null); setDraft({ amount: "", date: today(), categoryId: snapshot.categories[0]?.id ?? "", currency: snapshot.settings.baseCurrency, note: "", source: "personal", isPiloting: false }); };
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || !draft.categoryId || !draft.date) return;
    const patch = { amount, date: draft.date, month: monthFromDateInput(draft.date), week: weekFromDateInput(draft.date), categoryId: draft.categoryId, currency: draft.currency, note: draft.note, source: draft.source, isPiloting: draft.isPiloting, recurrenceType: "none" as const };
    if (editing) update(editing.id, patch); else add({ ...patch, year: snapshot.settings.selectedYear });
    reset();
  };
  const beginEdit = (entry: SpendingEntry) => { setEditing(entry); setDraft({ amount: String(entry.amount), date: entry.date, categoryId: entry.categoryId, currency: entry.currency, note: entry.note, source: entry.source ?? "personal", isPiloting: entry.isPiloting }); };

  return <div className="page-enter" style={{ display: "grid", gap: 24 }}>
    <Section title="Spending" action={<Button variant="primary" onClick={reset} disabled={!mutable}><Plus size={16} /> Add transaction</Button>}>
      {!mutable && <div className="historical-banner">Historical periods are read-only.</div>}
      {mutable && <form className="card card-body" onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <input className="input" aria-label="Amount" type="number" step="any" required placeholder="Amount" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <select className="select" aria-label="Currency" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as typeof draft.currency })}>{CURRENCY_OPTIONS.map((currency) => <option key={currency}>{currency}</option>)}</select>
        <input className="input" aria-label="Date" type="date" required value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <select className="select" aria-label="Category" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>{snapshot.categories.filter((category) => !category.archived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select className="select" aria-label="Payment source" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}><option value="personal">Budget</option><option value="external">Outside budget</option><option value="shared">Someone else paid</option></select>
        <input className="input" aria-label="Note" placeholder="Note (optional)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <label className="text-caption" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={draft.isPiloting} onChange={(e) => setDraft({ ...draft, isPiloting: e.target.checked })} /> Piloting</label>
        <div style={{ display: "flex", gap: 8 }}><Button variant="primary" type="submit">{editing ? "Save changes" : "Add transaction"}</Button>{editing && <Button variant="ghost" type="button" onClick={reset}>Cancel</Button>}</div>
      </form>}
      <input className="input" aria-label="Search transactions" placeholder="Search notes" value={search} onChange={(e) => setSearch(e.target.value)} />
    </Section>
    {entries.length === 0 ? <EmptyState title="No transactions for this month" description="Add an expense to begin tracking this period." /> : <div className="item-list">{entries.map((entry) => <div key={entry.id} className="item-row"><div><div className="text-callout" style={{ fontWeight: 600 }}>{snapshot.categories.find((c) => c.id === entry.categoryId)?.name ?? "Uncategorized"}</div><div className="text-footnote">{entry.date}{entry.note ? ` · ${entry.note}` : ""}</div></div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><strong>{formatMoney(entry.amount, entry.currency, snapshot.settings.currencyDisplayMode)}</strong>{mutable && <><Button variant="ghost" size="sm" icon onClick={() => beginEdit(entry)} aria-label="Edit transaction"><Pencil size={15} /></Button><Button variant="ghost" size="sm" icon onClick={() => { if (window.confirm("Delete this transaction?")) remove(entry.id); }} aria-label="Delete transaction"><Trash2 size={15} /></Button></>}</div></div>)}</div>}
  </div>;
};
