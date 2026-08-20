import React, { useMemo, useState } from "react";
import { calculateYear } from "../../domain/calculations";
import { formatDualMoney, statusLabel } from "../../utils/formatters";
import { monthName, formatDateTime } from "../../domain/dates";
import { useBudgetStore } from "../../store/budgetStore";
import type { AuditLog, AuditType } from "../../domain/types";
import { Badge } from "../ui/Badge";
import { EmptyState } from "../ui/EmptyState";
import { Section } from "../ui/Section";
import { AlertTriangle, CheckCircle2, Lock, ShieldAlert, StickyNote } from "lucide-react";

type Tab = "periods" | "closures" | "approvals" | "audit";

const AUDIT_FILTERS: { value: AuditType | "all" | "historical"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "historical", label: "Historical edits" },
  { value: "spending", label: "Spending" },
  { value: "activity", label: "Activities" },
  { value: "wishlist", label: "Wishlist" },
  { value: "wallet", label: "Wallet" },
  { value: "rollover", label: "Month close" },
  { value: "settings", label: "Settings" },
  { value: "delete", label: "Deletions" },
];

export const HistoryPanel: React.FC = () => {
  const snapshot = useBudgetStore((s) => s.snapshot);
  const calculation = useMemo(() => calculateYear(snapshot), [snapshot]);
  const setMonthlyNote = useBudgetStore((s) => s.setMonthlyNote);
  const [tab, setTab] = useState<Tab>("periods");
  const [auditFilter, setAuditFilter] = useState<AuditType | "all" | "historical">("all");
  /** Which month's note is being edited, and the text as it is being typed. */
  const [noteMonth, setNoteMonth] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const monthlyNotes = snapshot.years[String(snapshot.settings.selectedYear)]?.monthlyNotes ?? {};

  const closedMonths = useMemo(
    () =>
      Object.values(snapshot.years)
        .flatMap((record) => record.closedMonths.map((entry) => ({ ...entry, year: record.year })))
        .sort((a, b) => b.year - a.year || b.month - a.month),
    [snapshot.years],
  );

  const approvals = useMemo(
    () => [...snapshot.budgetApprovals].sort((a, b) => b.decidedAt.localeCompare(a.decidedAt)),
    [snapshot.budgetApprovals],
  );

  const auditEntries = useMemo(() => {
    if (auditFilter === "all") return snapshot.auditLog;
    if (auditFilter === "historical") return snapshot.auditLog.filter((entry) => entry.historicalEdit);
    return snapshot.auditLog.filter((entry) => entry.type === auditFilter);
  }, [snapshot.auditLog, auditFilter]);

  const historicalEditCount = useMemo(
    () => snapshot.auditLog.filter((entry) => entry.historicalEdit).length,
    [snapshot.auditLog],
  );

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "periods", label: "Periods" },
    { value: "closures", label: "Month closes", count: closedMonths.length },
    { value: "approvals", label: "Budget approvals", count: approvals.length },
    { value: "audit", label: "Audit trail", count: snapshot.auditLog.length },
  ];

  return (
    <div className="page-enter" style={{ display: "grid", gap: 20 }}>
      <Section title="Financial history">
        <div className="text-caption" style={{ marginBottom: 12 }}>
          Closed periods retain their recorded status; missing data is shown as unavailable rather than zero.
        </div>

        {historicalEditCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              marginBottom: 12,
              background: "var(--warning-soft)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
            }}
          >
            <ShieldAlert size={16} style={{ color: "var(--warning-text)", flexShrink: 0 }} />
            <span>
              {historicalEditCount} change{historicalEditCount !== 1 ? "s" : ""} rewrote a closed period.
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => {
                setTab("audit");
                setAuditFilter("historical");
              }}
            >
              Review
            </button>
          </div>
        )}

        <div className="segmented" role="tablist" aria-label="History sections">
          {tabs.map((entry) => (
            <button
              key={entry.value}
              role="tab"
              aria-selected={tab === entry.value}
              className={`segmented-item ${tab === entry.value ? "active" : ""}`}
              onClick={() => setTab(entry.value)}
            >
              {entry.label}
              {entry.count != null && <span className="segmented-count">{entry.count}</span>}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Monthly period summary ── */}
      {tab === "periods" && (
        <div className="item-list">
          {calculation.monthlyTrend.map((period) => {
            const month = period.month ?? 0;
            const stored = monthlyNotes[month];
            const isEditing = noteMonth === month;
            return (
              <div className="item-row" key={month} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <div className="text-callout" style={{ fontWeight: 600 }}>
                    {period.label} {period.year}
                  </div>
                  <div className="text-footnote">
                    {statusLabel(period.status)} · {period.entryCount} transaction{period.entryCount !== 1 ? "s" : ""}
                    {period.externalCount ? ` · ${period.externalCount} paid by others` : ""}
                  </div>
                  {/* The note lives with the month it describes: "the boiler
                      broke" is why March cost what it did, and a year later
                      that is the only thing that explains the figure. */}
                  {stored && !isEditing && (
                    <div className="text-caption" style={{ marginTop: 6, overflowWrap: "anywhere" }}>
                      <StickyNote size={12} aria-hidden="true" style={{ verticalAlign: "-2px", marginRight: 4 }} />
                      {stored.note}
                    </div>
                  )}
                  {isEditing && (
                    <form
                      style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}
                      onSubmit={(event) => {
                        event.preventDefault();
                        setMonthlyNote(period.year, month, noteDraft);
                        setNoteMonth(null);
                      }}
                    >
                      <input
                        className="input"
                        autoFocus
                        aria-label={`Note for ${period.label} ${period.year}`}
                        placeholder="Why this month looked the way it did"
                        value={noteDraft}
                        onChange={(event) => setNoteDraft(event.target.value)}
                        style={{ flex: "1 1 220px", minWidth: 0 }}
                      />
                      <button className="btn btn-primary btn-sm" type="submit">Save</button>
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => setNoteMonth(null)}>
                        Cancel
                      </button>
                    </form>
                  )}
                </div>
                <div className="row-trailing" style={{ alignItems: "flex-start" }}>
                  <strong>{formatDualMoney(period.total, snapshot.settings)}</strong>
                  {!isEditing && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setNoteMonth(month);
                        setNoteDraft(stored?.note ?? "");
                      }}
                    >
                      <StickyNote size={13} /> {stored ? "Edit note" : "Add note"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Month close records ── */}
      {tab === "closures" && (
        closedMonths.length === 0 ? (
          <EmptyState
            title="No months closed yet"
            description="Closing a month records its final total and whether the remainder rolled into your wallet."
          />
        ) : (
          <div className="item-list">
            {closedMonths.map((record) => {
              const blocked = record.status === "blocked-missing-data";
              const withRollover = record.status === "closed-with-rollover";
              return (
                <div className="item-row" key={record.id} style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="text-callout"
                      style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                    >
                      {monthName(record.month)} {record.year}
                      <Badge tone={blocked ? "warning" : withRollover ? "success" : "neutral"}>
                        {blocked ? "Blocked" : withRollover ? "Rollover applied" : "Closed"}
                      </Badge>
                    </div>
                    <div className="text-footnote">
                      {formatDateTime(record.confirmedAt)}
                      {record.note ? ` · ${record.note}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <strong>{formatDualMoney(record.spendTotal, snapshot.settings)}</strong>
                    <div
                      className="text-footnote"
                      style={{
                        color:
                          record.delta == null
                            ? undefined
                            : record.delta < 0
                            ? "var(--danger)"
                            : "var(--success)",
                      }}
                    >
                      {record.delta == null
                        ? "Delta unavailable"
                        : `${formatDualMoney(record.delta, snapshot.settings, { showSign: true })} delta`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Budget approvals (previously never rendered) ── */}
      {tab === "approvals" && (
        approvals.length === 0 ? (
          <EmptyState title="No budget approvals" description="Approved budgets are retained here as historical records." />
        ) : (
          <div className="item-list">
            {approvals.map((approval) => {
              const isApproved = approval.status === "approved";
              return (
                <div className="item-row" key={approval.id} style={{ alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div
                      className="text-callout"
                      style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                    >
                      {isApproved ? (
                        <CheckCircle2 size={15} style={{ color: "var(--success-text)" }} />
                      ) : (
                        <AlertTriangle size={15} style={{ color: "var(--text-tertiary)" }} />
                      )}
                      {monthName(approval.month)} {approval.year}
                      <Badge tone={isApproved ? "success" : "neutral"}>{isApproved ? "Approved" : "Rejected"}</Badge>
                      <span
                        className="text-footnote"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-tertiary)" }}
                        title="Approvals are permanent decision records and stay locked even when a period is unlocked for editing."
                      >
                        <Lock size={11} /> immutable
                      </span>
                    </div>
                    <div className="text-footnote">
                      Decided {formatDateTime(approval.decidedAt)} · suggested{" "}
                      {formatDualMoney(approval.suggestedAmount, snapshot.settings)} from{" "}
                      {formatDualMoney(approval.recurringTotal, snapshot.settings)} recurring
                      {approval.note ? ` · ${approval.note}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <strong>
                      {approval.approvedAmount != null
                        ? formatDualMoney(approval.approvedAmount, snapshot.settings)
                        : "—"}
                    </strong>
                    <div className="text-footnote">{isApproved ? "Approved amount" : "Not approved"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Audit trail ── */}
      {tab === "audit" && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            {AUDIT_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`chip ${auditFilter === filter.value ? "active" : ""}`}
                onClick={() => setAuditFilter(filter.value)}
              >
                {filter.label}
                {filter.value === "historical" && historicalEditCount > 0 ? ` (${historicalEditCount})` : ""}
              </button>
            ))}
          </div>

          {auditEntries.length === 0 ? (
            <EmptyState
              title="Nothing recorded"
              description={
                auditFilter === "historical"
                  ? "No closed period has been edited."
                  : "Changes you make are recorded here."
              }
            />
          ) : (
            <div className="item-list">
              {auditEntries.slice(0, 200).map((entry) => (
                <AuditRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}

          {auditEntries.length > 200 && (
            <div className="text-footnote" style={{ textAlign: "center" }}>
              Showing the 200 most recent of {auditEntries.length} entries.
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AuditRow: React.FC<{ entry: AuditLog }> = ({ entry }) => (
  <div
    className="item-row"
    style={{
      alignItems: "flex-start",
      ...(entry.historicalEdit ? { borderLeft: "3px solid var(--warning)" } : {}),
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div
        className="text-callout"
        style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
      >
        {entry.historicalEdit && <ShieldAlert size={14} style={{ color: "var(--warning-text)", flexShrink: 0 }} />}
        <span style={{ overflowWrap: "anywhere" }}>{entry.summary}</span>
      </div>
      <div className="text-footnote">
        {formatDateTime(entry.createdAt)} · {entry.type}
        {entry.historicalPeriod ? ` · rewrote ${entry.historicalPeriod}` : ""}
      </div>
    </div>
    {entry.historicalEdit && <Badge tone="warning">Historical</Badge>}
  </div>
);
