import React from "react";

interface FieldProps {
  label: string;
  /** Shown under the control, for the thing the label cannot say in two words. */
  hint?: React.ReactNode;
  /** Takes the full width of the editor's field grid. */
  span?: boolean;
  /**
   * Renders a `<div>` instead of a `<label>`.
   *
   * A label may only own one control, so a set of chips, swatches or
   * checkboxes gets a plain heading and carries its own `aria-label` on the
   * group element. Wrapping several controls in one label makes a screen
   * reader announce all of them for each.
   */
  group?: boolean;
  /** Marks the field the current cost model actually reads. */
  emphasised?: boolean;
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
/**
 * A titled set of related fields inside an editor.
 *
 * A `<fieldset>` rather than a `<div>`: the legend gives every control inside
 * it a group name a screen reader announces, which is the difference between
 * "Monthly cost" and "Prices, Monthly cost".
 */
export const FieldGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="field-group">
    <legend className="text-footnote">{title}</legend>
    <div className="field-grid">{children}</div>
  </fieldset>
);

export const Field: React.FC<FieldProps> = ({ label, hint, span, group, emphasised, children }) => {
  const Wrapper = group ? "div" : "label";
  return (
    <Wrapper className={`field${span ? " field-span" : ""}${emphasised ? " field-emphasised" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </Wrapper>
  );
};
