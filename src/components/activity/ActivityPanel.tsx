import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CURRENCY_OPTIONS, formatMoney } from "../../domain/currency";
import type { Activity } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { activityPrimaryCost, activityPrimaryCostLabel, activityToDraft, activityPayloadFromDraft } from "../../utils/formatters";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";

export const ActivityPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addActivity);
  const update = useBudgetStore((s) => s.updateActivity);
  const remove = useBudgetStore((s) => s.removeActivity);
  const mutable = useBudgetStore((s) => s.isCurrentPeriodMutable)();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [open, setOpen] = useState(false);
  const draft = activityToDraft(editing, snapshot);
  const [form, setForm] = useState(draft);
  const begin = (activity: Activity | null) => { setEditing(activity); setForm(activityToDraft(activity, snapshot)); setOpen(true); };
  const save = (event: React.FormEvent) => { event.preventDefault(); const payload = activityPayloadFromDraft(form); if (!payload.name || !payload.categoryId) return; if (editing) update(editing.id, payload); else add(payload); setOpen(false); };
  const activities = snapshot.years[String(snapshot.settings.selectedYear)]?.activities ?? [];

  return <div className="page-enter" style={{ display: "grid", gap: 20 }}>
    <Section title="Recurring activities" action={<Button variant="primary" disabled={!mutable} onClick={() => begin(null)}><Plus size={16} /> Add activity</Button>}>
      {!mutable && <div className="historical-banner">Historical periods are read-only.</div>}
      {open && <form className="card card-body" onSubmit={save} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <input className="input" required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className="select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>{snapshot.categories.filter((c) => !c.archived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select className="select" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as typeof form.currency })}>{CURRENCY_OPTIONS.map((currency) => <option key={currency}>{currency}</option>)}</select>
        <select className="select" value={form.recurrenceType} onChange={(e) => setForm({ ...form, recurrenceType: e.target.value as typeof form.recurrenceType })}>{["weekly", "monthly", "yearly", "session", "purchase", "custom"].map((type) => <option key={type}>{type}</option>)}</select>
        <input className="input" type="number" min="1" required aria-label="Recurrence interval" value={form.recurrenceInterval} onChange={(e) => setForm({ ...form, recurrenceInterval: Number(e.target.value) })} />
        <input className="input" type="number" step="any" placeholder="Monthly cost" value={form.pricePerMonth} onChange={(e) => setForm({ ...form, pricePerMonth: e.target.value })} />
        <input className="input" type="number" step="any" placeholder="Session cost" value={form.pricePerSession} onChange={(e) => setForm({ ...form, pricePerSession: e.target.value })} />
        <input className="input" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <label className="text-caption"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
        <div style={{ display: "flex", gap: 8 }}><Button type="submit" variant="primary">Save</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
      </form>}
    </Section>
    {activities.length === 0 ? <EmptyState title="No activities" description="Track recurring costs such as subscriptions, lessons, and bills." /> : <div className="item-list">{activities.slice().sort((a, b) => a.order - b.order).map((activity) => <div key={activity.id} className="item-row"><div><div className="text-callout" style={{ fontWeight: 600 }}>{activity.name}</div><div className="text-footnote">{activity.recurrenceType} · every {activity.recurrenceInterval} · {activity.active ? "active" : "paused"}</div></div><div style={{ display: "flex", alignItems: "center", gap: 8 }}><strong>{activityPrimaryCost(activity, snapshot)} {activityPrimaryCostLabel(activity)}</strong>{mutable && <><Button variant="ghost" size="sm" icon onClick={() => begin(activity)} aria-label="Edit activity"><Pencil size={15} /></Button><Button variant="ghost" size="sm" icon onClick={() => { if (window.confirm("Delete this activity?")) remove(activity.id); }} aria-label="Delete activity"><Trash2 size={15} /></Button></>}</div></div>)}</div>}
  </div>;
};
