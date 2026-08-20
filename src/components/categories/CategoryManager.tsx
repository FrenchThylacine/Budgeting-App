import React, { useState } from "react";
import { Archive, Pencil, Plus, X, Check, RotateCcw } from "lucide-react";
import type { BudgetBucket, BudgetCategory } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { formatDualMoney } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { Section } from "../ui/Section";
import { EditorSheet } from "../ui/EditorSheet";
import { EmptyState } from "../ui/EmptyState";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CategoryDraft {
  name: string;
  bucket: BudgetBucket;
  color: string;
  notes: string;
  description: string;
  icon: string;
  monthlyCap: string;
  parentId: string;
}

const BUCKET_OPTIONS: BudgetBucket[] = ["general", "piloting", "personal", "wallet"];

const BUCKET_LABELS: Record<BudgetBucket, string> = {
  general: "General",
  piloting: "Piloting",
  personal: "Personal",
  wallet: "Wallet",
};

/**
 * The bucket name is set *in* its colour, so these are the text variants
 * rather than the fill ones — the saturated tokens read at 2.6–4.0 against the
 * card, which is under the minimum for 12px type.
 */
const BUCKET_COLORS: Record<BudgetBucket, string> = {
  general: "var(--accent)",
  piloting: "var(--purple-text)",
  personal: "var(--success-text)",
  wallet: "var(--warning-text)",
};

function emptyDraft(): CategoryDraft {
  return {
    name: "",
    bucket: "general",
    color: "#64748B",
    notes: "",
    description: "",
    icon: "",
    monthlyCap: "",
    parentId: "",
  };
}

function draftFromCategory(cat: BudgetCategory): CategoryDraft {
  return {
    name: cat.name,
    bucket: cat.bucket,
    color: cat.color,
    notes: cat.notes ?? "",
    description: cat.description ?? "",
    icon: cat.icon ?? "",
    monthlyCap: cat.monthlyCap != null ? String(cat.monthlyCap) : "",
    parentId: cat.parentId ?? "",
  };
}

// ─── Inline Category Form ─────────────────────────────────────────────────────

interface CategoryFormProps {
  draft: CategoryDraft;
  categories: BudgetCategory[];
  excludeId?: string; // when editing, exclude self from parent options
  onChange: (patch: Partial<CategoryDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  submitLabel: string;
  /**
   * Suppress the form's own buttons.
   *
   * Inside a sheet the actions live in its sticky footer, so a long form never
   * scrolls its save button out of reach. Two sets of buttons would be two
   * places to look for the same thing.
   */
  hideActions?: boolean;
}

const CategoryForm: React.FC<CategoryFormProps> = ({
  draft,
  categories,
  excludeId,
  onChange,
  onSave,
  onCancel,
  submitLabel,
  hideActions,
}) => {
  const valid = draft.name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave();
  };

  // Parent options: non-archived, non-self, non-already-children (1-level deep)
  const parentOptions = categories.filter(
    (c) => !c.archived && c.id !== excludeId,
  );

  const capParsed = draft.monthlyCap === "" ? null : parseFloat(draft.monthlyCap);
  const capValid = draft.monthlyCap === "" || (Number.isFinite(capParsed) && (capParsed ?? 0) >= 0);

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
      {/* Row 1: name + bucket + color */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          required
          placeholder="Category name *"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          style={{ flex: "2 1 150px", minWidth: 130 }}
          autoFocus
        />
        <select
          className="select"
          value={draft.bucket}
          onChange={(e) => onChange({ bucket: e.target.value as BudgetBucket })}
          style={{ flex: "1 1 100px", minWidth: 90 }}
        >
          {BUCKET_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {BUCKET_LABELS[b]}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Colour</label>
          <input
            type="color"
            aria-label="Category colour"
            value={draft.color}
            onChange={(e) => onChange({ color: e.target.value })}
            style={{ width: 36, height: 36, border: "none", background: "none", cursor: "pointer", padding: 2 }}
          />
        </div>
      </div>

      {/* Row 2: monthly cap + parent */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 130px", minWidth: 110 }}>
          <input
            className="input"
            type="number"
            step="any"
            min="0"
            placeholder="Monthly cap (optional)"
            value={draft.monthlyCap}
            onChange={(e) => onChange({ monthlyCap: e.target.value })}
            style={{ width: "100%" }}
          />
          {!capValid && (
            <div style={{ fontSize: 11, color: "var(--danger-text)", marginTop: 2 }}>
              Must be a non-negative number
            </div>
          )}
        </div>
        <select
          className="select"
          value={draft.parentId}
          onChange={(e) => onChange({ parentId: e.target.value })}
          style={{ flex: "1 1 130px", minWidth: 110 }}
        >
          <option value="">No parent category</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Row 3: description */}
      <textarea
        className="input"
        placeholder="Description (optional)"
        value={draft.description}
        onChange={(e) => onChange({ description: e.target.value })}
        rows={2}
        style={{ resize: "vertical", minWidth: 0 }}
      />

      {/* Row 4: icon + notes */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="Icon name (e.g. ShoppingCart)"
          value={draft.icon}
          onChange={(e) => onChange({ icon: e.target.value })}
          style={{ flex: "1 1 140px", minWidth: 120 }}
        />
        <input
          className="input"
          placeholder="Notes (optional)"
          value={draft.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          style={{ flex: "2 1 160px", minWidth: 130 }}
        />
      </div>

      {/* Actions */}
      {!hideActions && (
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X size={14} /> Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!valid || !capValid}
        >
          <Check size={14} /> {submitLabel}
        </Button>
      </div>
      )}
    </form>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const CategoryManager: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const addCategory = useBudgetStore((s) => s.addCategory);
  const updateCategory = useBudgetStore((s) => s.updateCategory);
  const archiveCategory = useBudgetStore((s) => s.archiveCategory);

  const [showAdd, setShowAdd] = useState(false);
  const [addDraft, setAddDraft] = useState<CategoryDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<CategoryDraft | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const categories = snapshot.categories;
  const activeCategories = categories.filter((c) => !c.archived);
  const archivedCategories = categories.filter((c) => c.archived);

  const parentMap = new Map(categories.map((c) => [c.id, c]));

  // ── Add ──
  const handleAdd = () => {
    const cap =
      addDraft.monthlyCap === "" ? undefined : parseFloat(addDraft.monthlyCap);
    addCategory({
      name: addDraft.name.trim(),
      bucket: addDraft.bucket,
      color: addDraft.color,
      notes: addDraft.notes || undefined,
      description: addDraft.description || undefined,
      icon: addDraft.icon || undefined,
      monthlyCap: cap != null && Number.isFinite(cap) ? cap : undefined,
      parentId: addDraft.parentId || undefined,
    });
    setAddDraft(emptyDraft());
    setShowAdd(false);
  };

  // ── Edit ──
  const beginEdit = (cat: BudgetCategory) => {
    setEditingId(cat.id);
    setEditDraft(draftFromCategory(cat));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !editDraft || !editDraft.name.trim()) return;
    const cap =
      editDraft.monthlyCap === "" ? undefined : parseFloat(editDraft.monthlyCap);
    updateCategory(editingId, {
      name: editDraft.name.trim(),
      bucket: editDraft.bucket,
      color: editDraft.color,
      notes: editDraft.notes || undefined,
      description: editDraft.description || undefined,
      icon: editDraft.icon || undefined,
      monthlyCap: cap != null && Number.isFinite(cap) ? cap : undefined,
      parentId: editDraft.parentId || undefined,
    });
    cancelEdit();
  };

  // ── Unarchive (restore) via updateCategory ──
  const unarchiveCategory = (id: string) => {
    updateCategory(id, { archived: false });
  };

  // ── Render category row ──
  const renderCategory = (cat: BudgetCategory) => {
    const isEditing = editingId === cat.id;
    const parentCat = cat.parentId ? parentMap.get(cat.parentId) : undefined;

    return (
      <div key={cat.id}>
        <div
          className="item-row editable-row"
          role="button"
          tabIndex={0}
          aria-label={`Edit ${cat.name}`}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("button, a, input, select, textarea")) return;
            if (window.getSelection()?.toString()) return;
            beginEdit(cat);
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              beginEdit(cat);
            }
          }}
          style={{ opacity: cat.archived ? 0.55 : 1, alignItems: "flex-start" }}
        >
          {/* Left: colour dot + info */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 99,
                background: cat.color,
                flexShrink: 0,
                marginTop: 4,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                className="text-callout"
                style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {cat.name}
              </div>
              <div className="text-footnote" style={{ display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                <span
                  style={{
                    color: BUCKET_COLORS[cat.bucket],
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {BUCKET_LABELS[cat.bucket]}
                </span>
                {parentCat && (
                  <span style={{ color: "var(--text-tertiary)" }}>
                    ↳ {parentCat.name}
                  </span>
                )}
                {cat.monthlyCap != null && (
                  <span style={{ color: "var(--text-tertiary)" }}>
                    Cap: {formatDualMoney(cat.monthlyCap, snapshot.settings)}/mo
                  </span>
                )}
                {cat.archived && (
                  <span style={{ color: "var(--text-tertiary)" }}>archived</span>
                )}
                {cat.description && (
                  <span
                    style={{
                      color: "var(--text-tertiary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 200,
                    }}
                  >
                    {cat.description}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
            {!cat.archived && (
              <Button
                size="sm"
                variant="ghost"
                icon
                onClick={() => (isEditing ? cancelEdit() : beginEdit(cat))}
                aria-label={isEditing ? "Cancel edit" : "Edit category"}
                title={isEditing ? "Cancel" : "Edit"}
              >
                {isEditing ? <X size={14} /> : <Pencil size={14} />}
              </Button>
            )}
            {cat.archived ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => unarchiveCategory(cat.id)}
                aria-label="Restore category"
                title="Restore"
              >
                <RotateCcw size={14} /> Restore
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => archiveCategory(cat.id)}
                aria-label="Archive category"
                title="Archive"
                style={{ color: "var(--text-secondary)" }}
              >
                <Archive size={14} /> Archive
              </Button>
            )}
          </div>
        </div>

        {/* A dedicated editor rather than a form unfolding inside the list,
            which pushed every category below it out of view. */}
        {isEditing && editDraft && (
          <EditorSheet
            title={`Edit ${cat.name}`}
            subtitle="Bucket and cap are locked while a closed period is selected."
            onClose={cancelEdit}
            footer={
              <>
                <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
                <Button variant="primary" onClick={saveEdit}>Save changes</Button>
              </>
            }
          >
            <CategoryForm
              draft={editDraft}
              categories={categories}
              excludeId={editingId ?? undefined}
              onChange={(patch) =>
                setEditDraft((d) => ({ ...(d ?? emptyDraft()), ...patch }))
              }
              onSave={saveEdit}
              onCancel={cancelEdit}
              submitLabel="Save changes"
              hideActions
            />
          </EditorSheet>
        )}
      </div>
    );
  };

  return (
    <div className="page-enter" style={{ display: "grid", gap: 20 }}>
      <Section title="Categories">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          {!showAdd && (
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> New category
            </Button>
          )}
        </div>
        {showAdd && (
          <CategoryForm
            draft={addDraft}
            categories={categories}
            onChange={(patch) => setAddDraft((d) => ({ ...d, ...patch }))}
            onSave={handleAdd}
            onCancel={() => { setShowAdd(false); setAddDraft(emptyDraft()); }}
            submitLabel="Create category"
          />
        )}
      </Section>

      {/* Active categories */}
      {activeCategories.length === 0 && !showAdd ? (
        <EmptyState
          title="No categories yet"
          description="Categories organise your activities and spending."
        />
      ) : (
        <div className="item-list">{activeCategories.map(renderCategory)}</div>
      )}

      {/* Archived section */}
      {archivedCategories.length > 0 && (
        <Section
          title={`Archived (${archivedCategories.length})`}
        >
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
              }}
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "▾ Hide archived" : "▸ Show archived"}
            </button>
          </div>
          {showArchived && (
            <div className="item-list">{archivedCategories.map(renderCategory)}</div>
          )}
        </Section>
      )}

      {/* Info note about referential integrity */}
      <div
        style={{
          fontSize: 12,
          // Secondary rather than tertiary: the inset ground is darker than
          // the card, so tertiary lands at 4.2 here — under the minimum for
          // 12px type, and this paragraph explains why an edit changes how
          // past periods are reported, which is not a thing to make people
          // squint at.
          color: "var(--text-secondary)",
          padding: "10px 14px",
          background: "var(--bg-inset)",
          borderRadius: "var(--radius-sm)",
        }}
      >
        ℹ️ Transactions are never rewritten by a category edit, and archiving hides a category from new entries
        while preserving every existing transaction. Note that <strong>bucket</strong> and <strong>monthly cap</strong>
        are read live by budget calculations, so changing them also changes how past periods are reported — they are
        locked while you are viewing a historical period.
      </div>
    </div>
  );
};
