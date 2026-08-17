import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

interface DisclosureProps {
  title: string;
  /** Says what is inside, so the decision to open it is an informed one. */
  summary?: string;
  /**
   * Open on first render. Defaults to closed on a phone and open on a wider
   * screen: the same section that costs one glance on a desktop costs several
   * screens of scrolling on a phone.
   */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const Disclosure: React.FC<DisclosureProps> = ({ title, summary, defaultOpen, children }) => {
  const [open, setOpen] = useState(
    () => defaultOpen ?? !window.matchMedia?.("(max-width: 900px)").matches,
  );
  const panelId = useId();

  return (
    <section className={`disclosure${open ? " disclosure-open" : ""}`}>
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="disclosure-heading">
          <span className="text-title">{title}</span>
          {summary && <span className="text-caption disclosure-summary">{summary}</span>}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="disclosure-chevron" />
      </button>

      {/* Unmounted rather than hidden: these sections carry charts, and one that
          is merely invisible still measures, renders and re-renders on every
          state change for a user who has chosen not to look at it. */}
      {open && (
        <div className="disclosure-panel" id={panelId}>
          {children}
        </div>
      )}
    </section>
  );
};
