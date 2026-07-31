import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricProps {
  label: string;
  value: string | number;
  prefix?: React.ReactNode;
  delta?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
  detail?: string;
  children?: React.ReactNode;
}

export const Metric: React.FC<MetricProps> = ({ label, value, prefix, delta, tone = "neutral", detail, children }) => {
  const toneClass = tone === "positive" ? "positive" : tone === "negative" ? "negative" : tone === "warning" ? "warning" : "";
  return (
    <div className="metric-card card">
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
