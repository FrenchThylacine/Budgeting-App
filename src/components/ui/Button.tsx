import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  variant = "secondary", 
  size = "md", 
  icon = false,
  children, 
  className = "",
  ...props 
}) => {
  const sizeClass = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";
  const iconClass = icon ? "btn-icon" : "";

  /**
   * An icon-only button needs an accessible name.
   *
   * `title` is not one: it produces a mouse tooltip, and screen readers treat
   * it as a last-resort fallback that several ignore outright. Without this, the
   * undo, redo and theme buttons announced nothing at all — they contain an SVG
   * and no text. Falling back to the title keeps every existing call site
   * working without having to pass the same string twice.
   */
  const accessibleName = props["aria-label"] ?? (icon ? props.title : undefined);

  return (
    <button
      className={`btn btn-${variant} ${sizeClass} ${iconClass} ${className}`}
      {...props}
      aria-label={accessibleName}
    >
      {children}
    </button>
  );
};
