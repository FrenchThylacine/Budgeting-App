import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { useBudgetStore } from "../../store/budgetStore";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

export const WalletPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot); const add = useBudgetStore((s) => s.addWalletEntry); const remove = useBudgetStore((s) => s.removeWalletEntry); const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  const [amount, setAmount] = useState(""); const [source, setSource] = useState(""); const [currency, setCurrency] = useState(snapshot.settings.baseCurrency);
  const entries = snapshot.years[String(snapshot.settings.selectedYear)]?.walletEntries ?? [];
  const submit = (event: React.FormEvent) => { event.preventDefault(); const value = Number(amount); if (!Number.isFinite(value) || !source.trim()) return; add({ year: snapshot.settings.selectedYear, month: snapshot.settings.selectedMonth, amount: value, currency, source: source.trim(), type: "personal", note: "" }); setAmount(""); setSource(""); };
  return <div className="page-enter" style={{ display: "grid", gap: 20 }}><Section title="Wallet"><div className="text-caption" style={{ marginBottom: 12 }}>Track balances and manual adjustments separately from budget spending.</div>{mutable && <form className="card card-body" onSubmit={submit} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input className="input" type="number" step="any" required placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} /><select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>{CURRENCY_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select><input className="input" required placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} /><Button type="submit" variant="primary"><Plus size={16} /> Add entry</Button></form>}</Section>{entries.length === 0 ? <EmptyState title="No wallet entries" description="Add an opening balance or adjustment." /> : <div className="item-list">{entries.map((entry) => <div key={entry.id} className="item-row"><div><div className="text-callout" style={{ fontWeight: 600 }}>{entry.source}</div><div className="text-footnote">{entry.type} · month {entry.month}</div></div><div style={{ display: "flex", gap: 8, alignItems: "center" }}><strong>{formatMoney(entry.amount, entry.currency, snapshot.settings.currencyDisplayMode)}</strong>{mutable && entry.type !== "opening" && <Button size="sm" variant="ghost" icon onClick={() => { if (window.confirm("Delete this wallet entry?")) remove(entry.id); }} aria-label="Delete wallet entry"><Trash2 size={15} /></Button>}</div></div>)}</div>}</div>;
};
