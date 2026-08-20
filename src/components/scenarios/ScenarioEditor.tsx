import React, { useState } from "react";
import { useBudgetStore } from "../../store/budgetStore";
import { AdvancedFields, EditorSheet } from "../ui/EditorSheet";
import { Button } from "../ui/Button";
import { Field, FieldGroup } from "../ui/Field";
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
 * The same editor shell as activities, transactions, categories and the
 * wishlist: a centred dialog on a desktop, a full-screen sheet on a phone,
 * with the same header, the same field grid, the same sticky footer and the
 * same Advanced disclosure. It used to be a bespoke modal with its own focus
 * trap — and its own copy of the bug that trap had, which re-ran on every
 * render and pulled focus out of whatever field was being typed into. Using
 * the shared shell fixes that by construction rather than by repeating the
 * fix.
 *
 * Caps are entered per category, and an empty field means "this scenario does
 * not touch that cap" — distinct from a cap of zero, which is a real limit of
 * nothing. Collapsing the two would make it impossible to write a scenario
 * that leaves a category alone.
 */
export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({ preset, snapshot, onClose }) => {
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

  function numberOrUndefined(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed === "") return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function save(event: React.FormEvent): void {
    event.preventDefault();
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
  const cappedCount = Object.values(caps).filter((value) => value.trim() !== "").length;

  return (
    <EditorSheet
      title={preset ? `Edit ${preset.name}` : "New scenario"}
      subtitle="Nothing is applied until you preview and confirm it."
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" form="scenario-editor-form" disabled={!name.trim()}>
            {preset ? "Save changes" : "Create scenario"}
          </Button>
        </>
      }
    >
      <form id="scenario-editor-form" onSubmit={save} style={{ display: "grid", gap: 20, minWidth: 0 }}>
        <FieldGroup title="Scenario">
          <Field label="Name" span>
            <input
              className="input"
              required
              value={name}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              placeholder="Tight month"
            />
          </Field>
          <Field label="Monthly budget" hint="Leave empty to keep the current budget">
            <input
              className="input"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="—"
            />
          </Field>
          <Field
            label="Piloting"
            hint="Piloting stays visible either way — this only decides whether it counts toward the budget."
          >
            <select
              className="select"
              value={piloting}
              onChange={(event) => setPiloting(event.target.value as typeof piloting)}
            >
              <option value="unchanged">Leave as it is</option>
              <option value="counted">Counted in the budget</option>
              <option value="excluded">Excluded from the budget</option>
            </select>
          </Field>
          <Field label="Notes" span hint="When you would use this">
            <input
              className="input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </FieldGroup>

        {/* Most scenarios change one number. A column of every category is the
            uncommon case, and it should not be the first thing on screen. */}
        <AdvancedFields
          label={cappedCount > 0 ? `Category caps · ${cappedCount} set` : "Category caps"}
        >
          <p className="text-note" style={{ margin: "0 0 10px" }}>
            An empty field leaves that category's cap untouched. Zero is a real cap of nothing.
          </p>
          <div className="scenario-caps">
            {visibleCategories.map((category) => (
              <label key={category.id} className="scenario-cap-row">
                <span className="scenario-cap-name">
                  <span className="scenario-diff-dot" style={{ background: category.color }} aria-hidden="true" />
                  {category.name}
                </span>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={caps[category.id] ?? ""}
                  onChange={(event) => setCaps((current) => ({ ...current, [category.id]: event.target.value }))}
                  aria-label={`Cap for ${category.name}`}
                  placeholder="—"
                />
              </label>
            ))}
          </div>
        </AdvancedFields>
      </form>
    </EditorSheet>
  );
};
