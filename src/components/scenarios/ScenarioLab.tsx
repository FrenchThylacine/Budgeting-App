import React from "react";
import { FlaskConical } from "lucide-react";
import { useBudgetStore } from "../../store/budgetStore";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

export const ScenarioLab: React.FC = () => {
  const presets = useBudgetStore((s) => s.snapshot.scenarioPresets); const apply = useBudgetStore((s) => s.applyScenarioPreset); const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  return <div className="page-enter"><Section title="Scenarios"><div className="text-caption" style={{ marginBottom: 20 }}>Apply a saved budget scenario to the current working period. Historical periods remain protected.</div>{presets.length === 0 ? <EmptyState icon={<FlaskConical size={24} />} title="No saved scenarios" description="Scenario templates can be added in a future iteration." /> : <div className="item-list">{presets.map((preset) => <div key={preset.id} className="item-row"><div><div className="text-callout" style={{ fontWeight: 600 }}>{preset.name}</div><div className="text-footnote">{preset.notes}</div></div><Button variant="secondary" disabled={!mutable} onClick={() => apply(preset.id)}>Apply</Button></div>)}</div>}</Section></div>;
};
