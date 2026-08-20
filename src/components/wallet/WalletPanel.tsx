import React, { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { currencyOptionsFor, formatMoney, normalizeAmount } from "../../domain/currency";
import { calculateYear } from "../../domain/calculations";
import { monthName, formatDateTime } from "../../domain/dates";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import type { CurrencyCode, WalletEntryType } from "../../domain/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Metric } from "../ui/Metric";
import { Section } from "../ui/Section";

const ENTRY_TYPES: { value: WalletEntryType; label: string }[] = [
  { value: "personal", label: "Personal" },
  { value: "adjustment", label: "Adjustment" },
  { value: "budget", label: "Budget transfer" },
  { value: "opening", label: "Opening balance" },
];

const TYPE_TONE: Record<WalletEntryType, "neutral" | "info" | "success" | "warning"> = {
  opening: "info",
  personal: "neutral",
  budget: "warning",
  rollover: "success",
  adjustment: "neutral",
};

export const WalletPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addWalletEntry);
  const update = useBudgetStore((s) => s.updateWalletEntry);
  const remove = useBudgetStore((s) => s.removeWalletEntry);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const wallet = calculation.wallet;

  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(snapshot.settings.baseCurrency);
  const [type, setType] = useState<WalletEntryType>("personal");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editSource, setEditSource] = useState("");

  const entries = useMemo(() => {
    const list = snapshot.years[String(snapshot.settings.selectedYear)]?.walletEntries ?? [];
    // Newest first, so a freshly added adjustment is immediately visible.
    return [...list].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.month - a.month);
  }, [snapshot.years, snapshot.settings.selectedYear]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || !source.trim()) return;
    add({
      year: snapshot.settings.selectedYear,
      month: snapshot.settings.selectedMonth,
      amount: value,
      currency,
      source: source.trim(),
      type,
      note: note.trim(),
    });
    setAmount("");
    setSource("");
    setNote("");
  };

  const beginEdit = (id: string, currentAmount: number, currentSource: string) => {
    setEditingId(id);
    setEditAmount(String(currentAmount));
    setEditSource(currentSource);
  };

  const saveEdit = (id: string) => {
    const value = Number(editAmount);
    if (!Number.isFinite(value) || !editSource.trim()) return;
    update(id, { amount: value, source: editSource.trim() });
    setEditingId(null);
  };

  return (
    <div className="page-enter" style={{ display: "grid", gap: 20 }}>
      <Section title="Wallet">
        <div className="text-caption" style={{ marginBottom: 12 }}>
          Track balances and manual adjustments separately from budget spending.
        </div>

        {/* The balance is the whole point of a wallet; it was previously
            computed but only ever shown on other pages. */}
        <div className="dashboard-hero" style={{ marginBottom: 16 }}>
          <Metric
            label="Wallet balance"
            value={formatDualMoney(wallet.walletTotal, snapshot.settings)}
            tone={wallet.walletTotal >= 0 ? "positive" : "negative"}
            detail={`All entries for ${snapshot.settings.selectedYear}`}
          />
          <Metric
            label="Personal balance"
            value={formatDualMoney(wallet.personalWalletTotal, snapshot.settings)}
            detail="Excludes budget transfers"
          />
          <Metric
            label="Rollover total"
            value={formatDualMoney(wallet.rolloverTotal, snapshot.settings, { showSign: true })}
            tone={wallet.rolloverTotal >= 0 ? "positive" : "negative"}
            detail="Accumulated month-end rollovers"
          />
          <Metric
            label="Opening balance"
            value={formatDualMoney(wallet.openingBalance, snapshot.settings)}
            detail={`Carried into ${snapshot.settings.selectedYear}`}
          />
        </div>

        {mutable && (
          <form
            className="card card-body"
            onSubmit={submit}
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}
          >
            <input
              className="input"
              type="number"
              step="any"
              required
              aria-label="Amount"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select
              className="select"
              aria-label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
            >
              {currencyOptionsFor(snapshot.settings, currency).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              className="select"
              aria-label="Entry type"
              value={type}
              onChange={(e) => setType(e.target.value as WalletEntryType)}
            >
              {ENTRY_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              required
              aria-label="Source"
              placeholder="Source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <input
              className="input"
              aria-label="Note"
              placeholder="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" variant="primary">
              <Plus size={16} /> Add entry
            </Button>
          </form>
        )}
      </Section>

      {entries.length === 0 ? (
        <EmptyState title="No wallet entries" description="Add an opening balance or adjustment." />
      ) : (
        <div className="item-list">
          {entries.map((entry) =>
            editingId === entry.id ? (
              <div key={entry.id} className="item-row" style={{ gap: 10, flexWrap: "wrap" }}>
                <input
                  className="input"
                  type="number"
                  step="any"
                  aria-label="Edit amount"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  style={{ maxWidth: 140 }}
                />
                <input
                  className="input"
                  aria-label="Edit source"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  style={{ minWidth: 120, flex: 1 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" variant="primary" onClick={() => saveEdit(entry.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div
                key={entry.id}
                className={mutable ? "item-row editable-row" : "item-row"}
                role={mutable ? "button" : undefined}
                tabIndex={mutable ? 0 : undefined}
                aria-label={mutable ? `Edit ${entry.source}` : undefined}
                onClick={(event) => {
                  if (!mutable) return;
                  const target = event.target as HTMLElement;
                  if (target.closest("button, a, input, select, textarea")) return;
                  if (window.getSelection()?.toString()) return;
                  beginEdit(entry.id, entry.amount, entry.source);
                }}
                onKeyDown={(event) => {
                  if (!mutable || event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    beginEdit(entry.id, entry.amount, entry.source);
                  }
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    className="text-callout"
                    style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                  >
                    {entry.source}
                    <Badge tone={TYPE_TONE[entry.type] ?? "neutral"}>
                      {ENTRY_TYPES.find((t) => t.value === entry.type)?.label ?? entry.type}
                    </Badge>
                  </div>
                  <div className="text-footnote">
                    {monthName(entry.month)} {entry.year}
                    {entry.createdAt ? ` · ${formatDateTime(entry.createdAt)}` : ""}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ color: entry.amount < 0 ? "var(--danger)" : undefined }}>
                      {formatMoney(entry.amount, entry.currency, snapshot.settings.currencyDisplayMode)}
                    </strong>
                    {entry.currency !== snapshot.settings.baseCurrency && (
                      // Presentation-only conversion; the stored amount is untouched.
                      <div className="text-footnote">
                        ≈ {formatDualMoney(normalizeAmount(entry.amount, entry.currency, snapshot.settings), snapshot.settings)}
                      </div>
                    )}
                  </div>
                  {mutable && entry.type !== "opening" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => beginEdit(entry.id, entry.amount, entry.source)}
                        aria-label="Edit wallet entry"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        onClick={() => {
                          if (window.confirm("Delete this wallet entry?")) remove(entry.id);
                        }}
                        aria-label="Delete wallet entry"
                      >
                        <Trash2 size={15} />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
};
