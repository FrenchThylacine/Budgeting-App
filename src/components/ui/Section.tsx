import React, { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /**
   * Turns the heading into a control.
   *
   * For a page whose depth is worth having and worth putting away — the
   * statistics page is thirteen charts and five thousand pixels, of which a
   * reader wants two on any given visit.
   */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

/**
 * A titled block, optionally with actions beside the title.
 *
 * The header is a class rather than an inline style for one reason that
 * matters: it has to wrap. It was `display: flex; justify-content:
 * space-between` with no wrapping, which is fine for "Add" and breaks for
 * "Enregistrer une entrée ou une sortie" — a 272px button on a 320px screen,
 * pushing the page 57px sideways. Every language that is wordier than English
 * hit this, which is most of them.
 */
export const Section: React.FC<SectionProps> = ({
  title,
  children,
  className = "",
  action,
  collapsible = false,
  defaultOpen = true,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  if (!collapsible) {
    return (
      <section className={className}>
        {title && (
          <div className="section-head">
            <h2 className="text-title section-title">{title}</h2>
            {action && <div className="section-actions">{action}</div>}
          </div>
        )}
        {children}
      </section>
    );
  }

  /*
   * The heading becomes the control.
   *
   * Not a separate chevron beside it: the whole row is the target, which is
   * the difference between a section you can open on a phone and one you can
   * open with a mouse. The action stays outside the button, because a button
   * inside a button is neither.
   */
  return (
    <section className={`section-collapsible${open ? " is-open" : ""} ${className}`.trim()}>
      <div className="section-head">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={17} aria-hidden="true" className="section-chevron" />
          <h2 className="text-title section-title">{title}</h2>
        </button>
        {action && <div className="section-actions">{action}</div>}
      </div>
      {/* Unmounted rather than hidden: these sections carry charts, and one
          that is merely invisible still measures and re-renders on every state
          change for somebody who has chosen not to look at it. */}
      {open && <div id={panelId}>{children}</div>}
    </section>
  );
};
