import React, { useEffect, useMemo, useRef, useState } from "react";
import { CalendarX2, X } from "lucide-react";
import { toLocalDateInput } from "../../domain/schedule";
import type { Activity, ScheduleOverride, ScheduleOverrideKind } from "../../domain/types";

interface OccurrenceOverrideDialogProps {
  activity: Activity;
  /** The occurrence being changed, as it currently stands. */
  date: Date;
  currency: string;
  onApply: (overrides: ScheduleOverride[]) => void;
  onCancel: () => void;
}

type Choice = Extract<ScheduleOverrideKind, "skip" | "move" | "price"> | "clear";

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return `ovr-${globalThis.crypto.randomUUID()}`;
  return `ovr-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Change one occurrence without changing the rule.
 *
 * Editing the recurring rule to record that one week was skipped rewrites every
 * other month the rule produces — including closed ones. These exceptions apply
 * to a single date and leave the rule alone, which is the only way to record
 * "this once" without corrupting the rest of the year.
 */
export const OccurrenceOverrideDialog: React.FC<OccurrenceOverrideDialogProps> = ({
  activity,
  date,
  currency,
  onApply,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isoDate = toLocalDateInput(date);

  const existing = useMemo(
    () => (activity.scheduleOverrides ?? []).find((o) => o.date === isoDate || o.movedTo === isoDate),
    [activity.scheduleOverrides, isoDate],
  );

  const [choice, setChoice] = useState<Choice>(existing ? "clear" : "skip");
  const [movedTo, setMovedTo] = useState(existing?.movedTo ?? isoDate);
  const [amount, setAmount] = useState(
    existing?.amount != null ? String(existing.amount) : String(activity.pricePerSession ?? ""),
  );

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
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
  }, [onCancel]);

  const readable = date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function apply(): void {
    // The date this exception is keyed on is the RULE's date, not the moved
    // one — otherwise a second edit would look for an occurrence the rule never
    // produces and silently create a duplicate.
    const ruleDate = existing?.date ?? isoDate;
    const others = (activity.scheduleOverrides ?? []).filter((o) => o.date !== ruleDate);

    if (choice === "clear") {
      onApply(others);
      return;
    }

    const base = { id: existing?.id ?? createId(), date: ruleDate };

    if (choice === "skip") {
      onApply([...others, { ...base, kind: "skip" }]);
      return;
    }

    if (choice === "move") {
      onApply([...others, { ...base, kind: "move", movedTo }]);
      return;
    }

    const trimmed = amount.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    onApply([
      ...others,
      {
        ...base,
        kind: "price",
        // An empty field means "not stated", which is not the same as free.
        // Null keeps it unknown; the month's total then reports that it cannot
        // be derived rather than quietly understating.
        amount: parsed != null && Number.isFinite(parsed) ? parsed : null,
      },
    ]);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="occurrence-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: "min(460px, 100%)" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="occurrence-title" className="text-title" style={{ margin: 0 }}>
              Just this once
            </h2>
            <p className="text-caption" style={{ margin: "4px 0 0" }}>
              {activity.name} · {readable}
            </p>
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onCancel} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        <p className="text-note" style={{ margin: "0 0 14px" }}>
          The recurring rule stays as it is. Only this date changes.
        </p>

        <fieldset className="occurrence-choices">
          <legend className="sr-only">What to change</legend>

          <label className="occurrence-choice">
            <input type="radio" name="occurrence" checked={choice === "skip"} onChange={() => setChoice("skip")} />
            <span>
              <strong>Skip it</strong>
              <span className="text-note"> — it does not happen this time</span>
            </span>
          </label>

          <label className="occurrence-choice">
            <input type="radio" name="occurrence" checked={choice === "move"} onChange={() => setChoice("move")} />
            <span>
              <strong>Move it</strong>
              <span className="text-note"> — same cost, different day</span>
            </span>
          </label>
          {choice === "move" && (
            <input
              className="input occurrence-input"
              type="date"
              value={movedTo}
              onChange={(event) => setMovedTo(event.target.value)}
              aria-label="New date"
            />
          )}

          <label className="occurrence-choice">
            <input type="radio" name="occurrence" checked={choice === "price"} onChange={() => setChoice("price")} />
            <span>
              <strong>Different price</strong>
              <span className="text-note"> — just for this one</span>
            </span>
          </label>
          {choice === "price" && (
            <input
              className="input occurrence-input"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder={`Amount in ${currency}`}
              aria-label={`Amount in ${currency}`}
            />
          )}

          {existing && (
            <label className="occurrence-choice">
              <input type="radio" name="occurrence" checked={choice === "clear"} onChange={() => setChoice("clear")} />
              <span>
                <strong>Remove the exception</strong>
                <span className="text-note"> — go back to the rule</span>
              </span>
            </label>
          )}
        </fieldset>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={apply}>
            <CalendarX2 size={15} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
};
