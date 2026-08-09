import React from "react";
import { CURRENCY_OPTIONS } from "../../domain/currency";
import { useBudgetStore } from "../../store/budgetStore";
import { Section } from "../ui/Section";

export const SettingsPanel: React.FC = () => {
  const settings = useBudgetStore((s) => s.snapshot.settings); const update = useBudgetStore((s) => s.updateSettings);
  return <div className="page-enter" style={{ display: "grid", gap: 24 }}><Section title="Settings"><div className="card card-body" style={{ display: "grid", gap: 16, maxWidth: 620 }}><label className="text-callout">Display currency<select className="select" value={settings.baseCurrency} onChange={(e) => update({ baseCurrency: e.target.value as typeof settings.baseCurrency })}>{CURRENCY_OPTIONS.map((currency) => <option key={currency}>{currency}</option>)}</select></label><label className="text-callout">Monthly budget<input className="input" type="number" step="any" value={settings.monthlyBudget} onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value)) update({ monthlyBudget: value }); }} /></label><label className="text-caption"><input type="checkbox" checked={settings.pilotIncludedInBudget} onChange={(e) => update({ pilotIncludedInBudget: e.target.checked })} /> Include Piloting in the monthly budget total</label><label className="text-caption"><input type="checkbox" checked={settings.ignoreNonBudgetSpending ?? false} onChange={(e) => update({ ignoreNonBudgetSpending: e.target.checked })} /> Exclude non-budget payment sources from analytics</label><label className="text-caption"><input type="checkbox" checked={settings.darkMode} onChange={(e) => update({ darkMode: e.target.checked })} /> Dark mode</label></div></Section></div>;
};
