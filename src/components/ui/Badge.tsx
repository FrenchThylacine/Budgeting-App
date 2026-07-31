import React from "react";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, tone = "neutral", className = "" }) => (
  <span className={`badge badge-${tone} ${className}`}>{children}</span>
);
