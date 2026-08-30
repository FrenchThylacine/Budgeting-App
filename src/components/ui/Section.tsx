import React from "react";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
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
export const Section: React.FC<SectionProps> = ({ title, children, className = "", action }) => (
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
