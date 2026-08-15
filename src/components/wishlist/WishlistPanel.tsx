import React, { useState, useMemo } from "react";
import { Check, Pencil, Plus, Trash2, X, ShoppingBag } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import { useBudgetStore } from "../../store/budgetStore";
import {
  wishlistToDraft,
  parseAmount,
  wishlistViewMatches,
  formatDualMoney,
  priorityRank,
} from "../../utils/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import type { WishlistItem } from "../../domain/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewFilter = "all" | "active" | "bought";

interface EditDraft {
  name: string;
  actualPrice: string;
  currency: string;
  priority: WishlistItem["priority"];
  notes: string;
  inWishlist: boolean;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "#0071E3",
  medium: "#FF9500",
  high: "#FF3B30",
  dream: "#AF52DE",
};

const PRIORITY_OPTIONS: WishlistItem["priority"][] = ["low", "medium", "high", "dream"];

function emptyDraft(baseCurrency: string): EditDraft {
  return {
    name: "",
    actualPrice: "",
    currency: baseCurrency,
    priority: "medium",
    notes: "",
    inWishlist: true,
  };
}

function draftFromItem(item: WishlistItem): EditDraft {
  const d = wishlistToDraft(item);
  return {
    name: d.name,
    actualPrice: d.actualPrice,
    currency: d.currency,
    priority: d.priority,
    notes: d.notes,
    inWishlist: d.inWishlist,
  };
}

// ─── Shared edit form ────────────────────────────────────────────────────────

interface EditFormProps {
  draft: EditDraft;
  onChange: (patch: Partial<EditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  submitLabel: string;
}

const EditForm: React.FC<EditFormProps> = ({ draft, onChange, onSave, onCancel, submitLabel }) => {
  const valid = draft.name.trim().length > 0;
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave();
  };
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--bg-inset)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: 16,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          required
          placeholder="Item name *"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ flex: "2 1 160px", minWidth: 140 }}
          autoFocus
        />
        <input
          className="input"
          type="number"
          step="any"
          min="0"
          placeholder="Price (optional)"
          value={draft.actualPrice}
          onChange={(e) => onChange({ actualPrice: e.target.value })}
          style={{ flex: "1 1 110px", minWidth: 100 }}
        />
        <select
          className="select"
          value={draft.currency}
          onChange={(e) => onChange({ currency: e.target.value })}
          style={{ flex: "1 1 80px", minWidth: 70 }}
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          className="select"
          value={draft.priority}
          onChange={(e) => onChange({ priority: e.target.value as WishlistItem["priority"] })}
          style={{ flex: "1 1 90px", minWidth: 80 }}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className="input"
        placeholder="Notes (optional)"
        value={draft.notes}
        onChange={(e) => onChange({ notes: e.target.value })}
        rows={2}
        style={{ resize: "vertical", minWidth: 0 }}
      />
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={draft.inWishlist}
          onChange={(e) => onChange({ inWishlist: e.target.checked })}
        />
        In wishlist
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X size={14} /> Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!valid}>
          <Check size={14} /> {submitLabel}
        </Button>
      </div>
    </form>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

export const WishlistPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addWishlistItem);
  const update = useBudgetStore((s) => s.updateWishlistItem);
  const remove = useBudgetStore((s) => s.removeWishlistItem);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const { settings } = snapshot;
  const allItems: WishlistItem[] =
    snapshot.years[String(settings.selectedYear)]?.wishlistItems ?? [];

  const [view, setView] = useState<ViewFilter>("active");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState<EditDraft>(() => emptyDraft(settings.baseCurrency));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const filteredItems = useMemo(
    () => [...allItems].filter((item) => wishlistViewMatches(item, view)).sort(
      (a, b) => priorityRank(b.priority) - priorityRank(a.priority),
    ),
    [allItems, view],
  );

  const activeItems = useMemo(() => allItems.filter((i) => i.active && i.inWishlist && !i.bought), [allItems]);
  const boughtItems = useMemo(() => allItems.filter((i) => i.bought), [allItems]);

  // Totals
  const activeTotal = useMemo(
    () =>
      activeItems.reduce(
        (sum, i) =>
          sum + (i.actualPrice != null ? parseFloat(String(i.actualPrice)) || 0 : 0),
        0,
      ),
    [activeItems],
  );

  // --- Handlers ---

  const handleAdd = () => {
    const price = parseAmount(addDraft.actualPrice);
    if (!addDraft.name.trim()) return;
    add({
      name: addDraft.name.trim(),
      categoryId: "cat-wishlist",
      actualPrice: price,
      effectiveValue: price,
      currency: addDraft.currency as any,
      priority: addDraft.priority,
      notes: addDraft.notes,
      inWishlist: addDraft.inWishlist,
      bought: false,
      active: true,
    });
    setAddDraft(emptyDraft(settings.baseCurrency));
    setShowAddForm(false);
    setView("active");
  };

  const startEdit = (item: WishlistItem) => {
    setEditingId(item.id);
    setEditDraft(draftFromItem(item));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !editDraft || !editDraft.name.trim()) return;
    const price = parseAmount(editDraft.actualPrice);
    update(editingId, {
      name: editDraft.name.trim(),
      actualPrice: price,
      effectiveValue: price,
      currency: editDraft.currency as any,
      priority: editDraft.priority,
      notes: editDraft.notes,
      inWishlist: editDraft.inWishlist,
    });
    cancelEdit();
  };

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Delete "${name}" from your wishlist?`)) {
      remove(id);
    }
  };

  // --- View tab button ---
  const viewTabStyle = (tab: ViewFilter) => ({
    padding: "4px 12px",
    borderRadius: "var(--radius-full)",
    border: "1px solid var(--border)",
    background: view === tab ? "var(--accent-soft)" : "transparent",
    color: view === tab ? "var(--accent)" : "var(--text-secondary)",
    fontWeight: view === tab ? 600 : 400,
    fontSize: 13,
    cursor: "pointer",
  } as React.CSSProperties);

  return (
    <div className="page-enter" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 20 }}>
      <Section title="Wishlist">
        {/* Toolbar */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
          {/* View tabs */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minWidth: 0 }}>
            {(["active", "all", "bought"] as ViewFilter[]).map((tab) => (
              <button
                key={tab}
                type="button"
                style={viewTabStyle(tab)}
                onClick={() => setView(tab)}
              >
                {tab === "active"
                  ? `Active (${activeItems.length})`
                  : tab === "bought"
                  ? `Bought (${boughtItems.length})`
                  : `All (${allItems.length})`}
              </button>
            ))}
          </div>
          <div style={{ flex: "1 1 0", minWidth: 0 }} />
          {mutable && !showAddForm && (
            <Button variant="primary" size="sm" onClick={() => setShowAddForm(true)}>
              <Plus size={14} /> Add item
            </Button>
          )}
        </div>

        {/* Add form */}
        {mutable && showAddForm && (
          <EditForm
            draft={addDraft}
            onChange={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
            onSave={handleAdd}
            onCancel={() => { setShowAddForm(false); setAddDraft(emptyDraft(settings.baseCurrency)); }}
            submitLabel="Add item"
          />
        )}
      </Section>

      {/* Item list */}
      {filteredItems.length === 0 ? (
        <EmptyState
          title={
            view === "active"
              ? "No active wishlist items"
              : view === "bought"
              ? "Nothing bought yet"
              : "Your wishlist is empty"
          }
          description="Save future purchases without mixing them with monthly spending."
        />
      ) : (
        <div className="item-list">
          {filteredItems.map((item) => {
            const isEditing = editingId === item.id;
            const priorityColor = PRIORITY_COLORS[item.priority] ?? "#64748B";
            return (
              <div key={item.id}>
                {/* Item row */}
                <div
                  className="item-row"
                  style={{ opacity: item.bought ? 0.6 : 1, alignItems: "flex-start" }}
                >
                  {/* Left: priority dot + info */}
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 99,
                        background: priorityColor,
                        flexShrink: 0,
                        marginTop: 4,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="text-callout"
                        style={{
                          fontWeight: 600,
                          textDecoration: item.bought ? "line-through" : "none",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </div>
                      <div className="text-footnote" style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                        <span
                          style={{
                            color: priorityColor,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        >
                          {item.priority}
                        </span>
                        {item.bought && item.datePurchased && (
                          <span style={{ color: "var(--text-tertiary)" }}>
                            Bought {new Date(item.datePurchased).toLocaleDateString()}
                          </span>
                        )}
                        {!item.inWishlist && (
                          <span style={{ color: "var(--text-tertiary)" }}>Not in wishlist</span>
                        )}
                        {item.notes && (
                          <span
                            style={{
                              color: "var(--text-tertiary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 200,
                            }}
                          >
                            {item.notes}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: price + actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <strong style={{ fontSize: 14 }}>
                      {item.actualPrice != null
                        ? formatMoney(item.actualPrice, item.currency, settings.currencyDisplayMode)
                        : "—"}
                    </strong>
                    {mutable && !item.bought && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        onClick={() => update(item.id, { bought: true })}
                        aria-label="Mark bought"
                        title="Mark as bought"
                      >
                        <Check size={14} />
                      </Button>
                    )}
                    {mutable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        onClick={() => (isEditing ? cancelEdit() : startEdit(item))}
                        aria-label={isEditing ? "Cancel edit" : "Edit item"}
                        title={isEditing ? "Cancel" : "Edit"}
                      >
                        {isEditing ? <X size={14} /> : <Pencil size={14} />}
                      </Button>
                    )}
                    {mutable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        onClick={() => handleDelete(item.id, item.name)}
                        aria-label="Delete wishlist item"
                        title="Delete"
                        style={{ color: "var(--danger)" }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && editDraft && (
                  <div style={{ marginTop: -4, marginBottom: 4 }}>
                    <EditForm
                      draft={editDraft}
                      onChange={(patch) => setEditDraft((d) => ({ ...(d ?? emptyDraft("")), ...patch }))}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      submitLabel="Save changes"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary footer */}
      {allItems.length > 0 && (
        <div
          className="card card-body"
          style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}
        >
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Active items: </span>
            <strong>{activeItems.length}</strong>
          </div>
          {activeTotal > 0 && (
            <div>
              <span style={{ color: "var(--text-secondary)" }}>Active total: </span>
              <strong>{formatDualMoney(activeTotal, settings)}</strong>
            </div>
          )}
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Bought: </span>
            <strong>{boughtItems.length}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
