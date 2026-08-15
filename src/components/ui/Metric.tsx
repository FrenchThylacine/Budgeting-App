import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type MetricTone = "neutral" | "positive" | "negative" | "warning" | "accent";

interface MetricProps {
  label: string;
  value: string | number;
  prefix?: React.ReactNode;
  delta?: string;
  tone?: MetricTone;
  detail?: string;
  children?: React.ReactNode;
}

/**
 * Status is carried by three redundant channels — a tinted rail, the value
 * colour, and (for deltas) a direction icon — so it stays readable without
 * relying on colour perception alone.
 */
export const Metric: React.FC<MetricProps> = ({ label, value, prefix, delta, tone = "neutral", detail, children }) => {
  const toneClass = tone === "neutral" ? "" : tone;
  return (
    <div className={`metric-card card ${tone === "neutral" ? "" : `tone-${tone}`}`}>
      <div className="metric-label">
        {prefix}
        {label}
      </div>
      <div className={`metric-value ${toneClass}`}>{value}</div>
      {delta && (
        <div className="metric-delta" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {tone === "positive" ? <TrendingUp size={14} /> : tone === "negative" ? <TrendingDown size={14} /> : <Minus size={14} />}
          {delta}
        </div>
      )}
      {detail && <div className="metric-delta">{detail}</div>}
      {children}
    </div>
  );
};
