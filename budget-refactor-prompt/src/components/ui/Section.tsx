import React from "react";

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, children, className = "", action }) => (
  <section className={className}>
    {title && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 className="text-title">{title}</h2>
        {action}
      </div>
    )}
    {children}
  </section>
);
