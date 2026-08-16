import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import type { BudgetSnapshot, ScenarioPreset } from "../../domain/types";

interface ScenarioEditorProps {
  /** null when creating a new one. */
  preset: ScenarioPreset | null;
  snapshot: BudgetSnapshot;
  onClose: () => void;
}

/**
 * Create or edit a scenario.
 *
 * Caps are entered per category, and an empty field means "this scenario does
 * not touch that cap" — distinct from a cap of zero, which is a real limit of
 * nothing. Collapsing the two would make it impossible to write a scenario that
 * leaves a category alone.
 */
export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({ preset, snapshot, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const add = useBudgetStore((s) => s.addScenarioPreset);
  const update = useBudgetStore((s) => s.updateScenarioPreset);

  const [name, setName] = useState(preset?.name ?? "");
  const [notes, setNotes] = useState(preset?.notes ?? "");
  const [budget, setBudget] = useState(preset?.monthlyBudget != null ? String(preset.monthlyBudget) : "");
  const [piloting, setPiloting] = useState<"unchanged" | "counted" | "excluded">(
    preset?.pilotIncludedInBudget == null ? "unchanged" : preset.pilotIncludedInBudget ? "counted" : "excluded",
  );
  const [caps, setCaps] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [categoryId, cap] of Object.entries(preset?.categoryCaps ?? {})) {
      initial[categoryId] = String(cap);
    }
    return initial;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  function numberOrUndefined(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function save(): void {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const categoryCaps: Record<string, number> = {};
    for (const [categoryId, raw] of Object.entries(caps)) {
      const parsed = numberOrUndefined(raw);
      // Zero is kept: a cap of nothing is a real instruction. Only an empty
      // field means "leave this category's cap alone".
      if (parsed !== undefined) categoryCaps[categoryId] = parsed;
    }

    const payload = {
      name: trimmedName,
      notes: notes.trim(),
      monthlyBudget: numberOrUndefined(budget),
      pilotIncludedInBudget: piloting === "unchanged" ? undefined : piloting === "counted",
      categoryCaps: Object.keys(categoryCaps).length > 0 ? categoryCaps : undefined,
    };

    if (preset) update(preset.id, payload);
    else add(payload);
    onClose();
  }

  const visibleCategories = snapshot.categories.filter((category) => !category.archived);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-editor-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "min(560px, 100%)", maxHeight: "min(86dvh, 900px)", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <h2 id="scenario-editor-title" className="text-title" style={{ margin: 0 }}>
            {preset ? "Edit scenario" : "New scenario"}
          </h2>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <label className="auth-field">
            <span className="text-caption">Name</span>
            <input
              className="input"
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Tight month"
            />
          </label>

          <label className="auth-field">
            <span className="text-caption">Monthly budget</span>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder={`Leave empty to keep the current budget`}
            />
          </label>

          <label className="auth-field">
            <span className="text-caption">Piloting</span>
            <select
              className="select"
              value={piloting}
              onChange={(event) => setPiloting(event.target.value as typeof piloting)}
            >
              <option value="unchanged">Leave as it is</option>
              <option value="counted">Counted in the budget</option>
              <option value="excluded">Excluded from the budget</option>
            </select>
            <span className="text-note">
              Piloting stays visible either way — this only decides whether it counts toward the budget.
            </span>
          </label>

          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="text-caption" style={{ marginBottom: 6 }}>Category caps</legend>
            <p className="text-note" style={{ margin: "0 0 10px" }}>
              An empty field leaves that category's cap untouched. Zero is a real cap of nothing.
            </p>
            <div className="scenario-caps">
              {visibleCategories.map((category) => (
                <label key={category.id} className="scenario-cap-row">
                  <span className="scenario-cap-name">
                    <span
                      className="scenario-diff-dot"
                      style={{ background: category.color }}
                      aria-hidden="true"
                    />
                    {category.name}
                  </span>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={caps[category.id] ?? ""}
                    onChange={(event) =>
                      setCaps((current) => ({ ...current, [category.id]: event.target.value }))
                    }
                    aria-label={`Cap for ${category.name}`}
                    placeholder="—"
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <label className="auth-field">
            <span className="text-caption">Notes</span>
            <input
              className="input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="When you would use this"
            />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
            {preset ? "Save changes" : "Create scenario"}
          </button>
        </div>
      </div>
    </div>
  );
};
