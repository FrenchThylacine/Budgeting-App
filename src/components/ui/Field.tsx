import React from "react";

interface FieldProps {
  label: string;
  /** Shown under the control, for the thing the label cannot say in two words. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * A labelled form control.
 *
 * The editors previously carried their labels in `aria-label` and `placeholder`
 * only. A screen reader was served; a sighted user was not. Placeholders vanish
 * the moment anything is typed, and a `<select>` has no placeholder at all — so
 * the transaction sheet showed a box reading "Budget" and another reading
 * "One-off" with nothing to say that the first meant who paid and the second
 * how often it repeats. Someone editing an amount they entered last month could
 * not tell what they were looking at.
 *
 * A wrapping `<label>` also makes the text a hit target for the control, which
 * on a phone is a materially larger thing to aim at.
 */
export const Field: React.FC<FieldProps> = ({ label, hint, children }) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </label>
);
