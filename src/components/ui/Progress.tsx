import React from "react";

interface ProgressProps {
  value: number;
  max?: number;
  tone?: "neutral" | "success" | "warning" | "danger";
  /** Explicit fill colour, e.g. a category's own colour. Overrides `tone`. */
  color?: string;
  className?: string;
  label?: string;
}

export const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  tone = "neutral",
  color,
  className = "",
  label,
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className={`progress-track ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`progress-fill ${color ? "" : tone}`}
        style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
};

export const CircularProgress: React.FC<{ value: number; size?: number; stroke?: number; tone?: string }> = ({
  value,
  size = 64,
  stroke = 5,
  tone = "var(--accent)",
}) => {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  return (
    <svg width={size} height={size} className="progress-ring">
      <circle
        stroke="var(--bg-inset)"
        strokeWidth={stroke}
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className="progress-ring-circle"
        stroke={tone}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
        style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
      />
    </svg>
  );
};
