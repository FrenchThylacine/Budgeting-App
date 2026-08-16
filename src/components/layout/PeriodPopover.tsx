import React, { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";

interface PeriodPopoverProps {
  /** What the trigger shows when closed: the period currently selected. */
  summary: string;
  /** Marks the trigger when the selection is not the real current period. */
  historical?: boolean;
  children: React.ReactNode;
}

/**
 * The period selector, collapsed into a widget.
 *
 * It used to sit open at the top of every page: a mode toggle, two dropdowns
 * and two arrows, permanently occupying the most valuable strip of the screen
 * to serve an action most sessions perform once, if at all. On a phone it took
 * a third of the first viewport before any figure appeared.
 *
 * Collapsed, the header states the selected period as a sentence — which is
 * the part people actually need continuously — and the controls appear on
 * demand.
 */
export const PeriodPopover: React.FC<PeriodPopoverProps> = ({ summary, historical, children }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    // Focus moves into the panel, so a keyboard user is not left behind on the
    // trigger with the controls unreachable.
    panelRef.current?.querySelector<HTMLElement>("button, select")?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        // Escape returns focus where it came from, or the page loses its place.
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="period-popover" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`period-trigger${historical ? " period-trigger-historical" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarDays size={15} aria-hidden="true" />
        <span className="period-trigger-label">{summary}</span>
        <ChevronDown size={14} aria-hidden="true" className="period-trigger-chevron" />
      </button>

      {open && (
        <div className="period-panel" id={panelId} ref={panelRef} role="group" aria-label="Change period">
          {children}
        </div>
      )}
    </div>
  );
};
