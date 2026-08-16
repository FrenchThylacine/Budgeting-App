import React, { useState } from "react";
import { Check, Copy, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import { isScenarioActive, scenarioDiff } from "../../domain/scenarios";
import { formatMoney } from "../../domain/currency";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import { ScenarioEditor } from "./ScenarioEditor";
import { ScenarioApplyDialog } from "./ScenarioApplyDialog";
import type { ScenarioPreset } from "../../domain/types";

/**
 * Saved budget scenarios.
 *
 * Previously this listed the presets and offered a single "Apply" button.
 * Applying one silently rewrote the monthly budget, the piloting rule and every
 * category cap the scenario named, with nothing shown beforehand and no way to
 * create, edit, duplicate or delete a scenario at all — the seeded three were
 * all anyone could ever have.
 */
export const ScenarioLab: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const presets = snapshot.scenarioPresets;
  const apply = useBudgetStore((s) => s.applyScenarioPreset);
  const duplicate = useBudgetStore((s) => s.duplicateScenarioPreset);
  const remove = useBudgetStore((s) => s.removeScenarioPreset);
  const capture = useBudgetStore((s) => s.captureScenarioPreset);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();

  const [editing, setEditing] = useState<ScenarioPreset | "new" | null>(null);
  const [applying, setApplying] = useState<ScenarioPreset | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const money = (value: number | null | undefined): string =>
    value == null ? "—" : formatMoney(value, snapshot.settings.baseCurrency, snapshot.settings.currencyDisplayMode);

  return (
    <div className="page-enter">
      <Section
        title="Scenarios"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!mutable}
              onClick={() => {
                const name = window.prompt("Name this snapshot of your current budget:", "Current setup");
                if (name?.trim()) capture(name.trim());
              }}
            >
              <Check size={14} /> Save current
            </Button>
            <Button variant="primary" size="sm" disabled={!mutable} onClick={() => setEditing("new")}>
              <Plus size={14} /> New scenario
            </Button>
          </div>
        }
      >
        <p className="text-note" style={{ marginBottom: 20 }}>
          A scenario stores a monthly budget, whether piloting counts toward it, and category caps.
          Applying one changes those settings — you will see exactly what changes before it happens.
          Closed periods stay protected.
        </p>

        {presets.length === 0 ? (
          <EmptyState
            icon={<FlaskConical size={24} />}
            title="No scenarios yet"
            description="Save your current budget as a scenario, or build one from scratch, to compare setups without losing the one you have."
          />
        ) : (
          <div className="scenario-list">
            {presets.map((preset) => {
              const changes = scenarioDiff(snapshot, preset);
              const active = isScenarioActive(snapshot, preset);
              return (
                <article key={preset.id} className={`scenario-card${active ? " scenario-card-active" : ""}`}>
                  <header className="scenario-head">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="text-callout scenario-name">{preset.name}</h3>
                      {preset.notes && <p className="text-note scenario-notes">{preset.notes}</p>}
                    </div>
                    {active && (
                      <span className="scenario-badge" title="These settings are already in effect">
                        <Check size={12} aria-hidden="true" /> In effect
                      </span>
                    )}
                  </header>

                  <dl className="scenario-figures">
                    <div>
                      <dt className="text-footnote">Budget</dt>
                      <dd className="money">{money(preset.monthlyBudget)}</dd>
                    </div>
                    <div>
                      <dt className="text-footnote">Piloting</dt>
                      <dd>
                        {preset.pilotIncludedInBudget == null
                          ? "—"
                          : preset.pilotIncludedInBudget
                            ? "Counted"
                            : "Excluded"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-footnote">Caps</dt>
                      <dd>{Object.keys(preset.categoryCaps ?? {}).length || "—"}</dd>
                    </div>
                  </dl>

                  <footer className="scenario-actions">
                    <Button
                      variant="primary"
                      size="sm"
                      // Applying a scenario already in effect changes nothing;
                      // offering the button would suggest otherwise.
                      disabled={!mutable || active}
                      onClick={() => setApplying(preset)}
                    >
                      {active ? "Already applied" : `Apply (${changes.length} change${changes.length === 1 ? "" : "s"})`}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!mutable} onClick={() => setEditing(preset)}>
                      <Pencil size={14} /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" disabled={!mutable} onClick={() => duplicate(preset.id)}>
                      <Copy size={14} /> Duplicate
                    </Button>
                    {confirmDelete === preset.id ? (
                      <span className="scenario-confirm">
                        <span className="text-note">Delete it?</span>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            remove(preset.id);
                            setConfirmDelete(null);
                          }}
                        >
                          Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!mutable}
                        onClick={() => setConfirmDelete(preset.id)}
                      >
                        <Trash2 size={14} /> Delete
                      </Button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      {editing && (
        <ScenarioEditor
          preset={editing === "new" ? null : editing}
          snapshot={snapshot}
          onClose={() => setEditing(null)}
        />
      )}

      {applying && (
        <ScenarioApplyDialog
          preset={applying}
          snapshot={snapshot}
          onCancel={() => setApplying(null)}
          onConfirm={() => {
            apply(applying.id);
            setApplying(null);
          }}
        />
      )}
    </div>
  );
};
