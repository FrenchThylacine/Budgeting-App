import React from "react";
import type { TrendBar } from "../../domain/analytics";

/**
 * Dependency-free bar chart shared by the Dashboard and the Analytics page.
 * Missing periods render as "?" so unavailable data is never drawn as zero.
 */
export function TrendBarChart({ bars, height = 140 }: { bars: TrendBar[]; height?: number }) {
  const max = Math.max(...bars.map((b) => b.value ?? 0), 1);
  return (
    <div
      className="chart-container"
      role="img"
      aria-label={`Spending trend: ${bars
        .map((b) => `${b.label} ${b.value != null ? Math.round(b.value) : "no data"}`)
        .join(", ")}`}
      style={{ display: "flex", alignItems: "flex-end", gap: 6, paddingTop: 20, height }}
    >
      {bars.map((bar, i) => {
        const hasValue = bar.value != null;
        const pct = hasValue ? (bar.value! / max) * 100 : 0;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              height: "100%",
              justifyContent: "flex-end",
            }}
          >
            {hasValue ? (
              <div
                title={`${bar.label}: ${bar.value}`}
                style={{
                  width: "100%",
                  height: `${Math.max(pct, 3)}%`,
                  background: bar.highlight ? "var(--accent)" : "var(--bg-inset)",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.5s ease-out",
                  opacity: bar.highlight ? 1 : 0.55,
                }}
              />
            ) : (
              <span className="text-footnote" style={{ color: "var(--text-tertiary)" }}>?</span>
            )}
            <span
              className="text-footnote"
              style={{
                fontSize: "0.625rem",
                color: bar.highlight ? "var(--accent)" : undefined,
                fontWeight: bar.highlight ? 600 : 400,
                overflow: "hidden",
                textOverflow: "clip",
                whiteSpace: "nowrap",
              }}
            >
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
