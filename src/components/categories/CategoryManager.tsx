import React, { useState } from "react";
import { Archive, Plus } from "lucide-react";
import type { BudgetBucket } from "../../domain/types";
import { useBudgetStore } from "../../store/budgetStore";
import { Button } from "../ui/Button";
import { Section } from "../ui/Section";

export const CategoryManager: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const add = useBudgetStore((s) => s.addCategory);
  const archive = useBudgetStore((s) => s.archiveCategory);
  const [name, setName] = useState(""); const [bucket, setBucket] = useState<BudgetBucket>("general"); const [color, setColor] = useState("#64748B");
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!name.trim()) return; add({ name: name.trim(), bucket, color }); setName(""); };
  return <div className="page-enter" style={{ display: "grid", gap: 20 }}><Section title="Categories"><form onSubmit={submit} className="card card-body" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input className="input" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} /><select className="select" value={bucket} onChange={(e) => setBucket(e.target.value as BudgetBucket)}>{["general", "piloting", "personal", "wallet"].map((value) => <option key={value}>{value}</option>)}</select><input aria-label="Category color" type="color" value={color} onChange={(e) => setColor(e.target.value)} /><Button variant="primary" type="submit"><Plus size={16} /> Add</Button></form></Section><div className="item-list">{snapshot.categories.map((category) => <div key={category.id} className="item-row" style={{ opacity: category.archived ? .55 : 1 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 12, height: 12, borderRadius: 99, background: category.color }} /><div><div className="text-callout" style={{ fontWeight: 600 }}>{category.name}</div><div className="text-footnote">{category.bucket}{category.archived ? " · archived" : ""}</div></div></div>{!category.archived && <Button size="sm" variant="ghost" onClick={() => archive(category.id)}><Archive size={15} /> Archive</Button>}</div>)}</div></div>;
};
