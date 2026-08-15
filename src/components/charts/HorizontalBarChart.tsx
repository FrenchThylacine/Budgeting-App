import React from "react";
import { ChartFrame, ChartPlaceholder, chartName, useChartTooltip, type ChartName } from "./ChartFrame";
import { compactNumber, hBarPath, linearScale, niceDomain, textWidth, truncateToWidth } from "./scale";

export interface HorizontalBarRow {
  /** Defaults to the label when omitted. */
  id?: string;
  label: string;
  value: number;
  /** The entity's own colour — identity never depends on rank. */
  color?: string;
  /** Pre-formatted value; defaults to `formatValue(value)`. */
  valueLabel?: string;
  /** Context line under the bar, e.g. "18.2% · 4 transactions". */
  caption?: string;
  /** Alias of `caption`. */
  detail?: string;
  /** Threshold marker, e.g. a category's monthly cap. */
  marker?: { value: number; label: string };
  /** Small badge next to the label, e.g. "Over cap". */
  badge?: string;
  badgeTone?: "danger" | "neutral";
  /** Row state; "danger" also tints the value (e.g. a breached cap). */
  tone?: "danger" | "neutral";
}

type HorizontalBarChartProps = {
  rows: HorizontalBarRow[];
  description?: string;
  /** Defaults to a compact number when the caller labels rows itself. */
  formatValue?: (value: number) => string;
  footer?: React.ReactNode;
  emptyMessage?: string;
} & ChartName;

const ROW_HEIGHT = 48;
const BAR_HEIGHT = 10;
const LABEL_SIZE = 12;

/**
 * Ranked magnitudes with long names — the case where horizontal bars beat
 * columns. Each bar wears its category's own colour so identity survives
 * filtering and re-ordering.
 */
export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  rows,
  description,
  formatValue = compactNumber,
  footer,
  emptyMessage = "No spending recorded for this period.",
  ...naming
}) => {
  const { tooltip, show, hide } = useChartTooltip();

  if (rows.length === 0) return <ChartPlaceholder height={120} message={emptyMessage} />;

  const height = rows.length * ROW_HEIGHT;
  const valueTextOf = (row: HorizontalBarRow) => row.valueLabel ?? formatValue(row.value);

  return (
    <ChartFrame
      title={chartName(naming)}
      description={description ?? rows.map((row) => `${row.label}: ${valueTextOf(row)}`).join(", ")}
      height={height}
      footer={footer}
      tooltip={tooltip}
    >
      {({ width }) => {
        const maxValue = Math.max(
          0,
          ...rows.map((row) => Math.max(row.value, row.marker?.value ?? 0)),
        );
        const domain = niceDomain(0, maxValue, 3);
        const xOf = linearScale(0, domain.max, 0, Math.max(width, 1));

        return (
          <>
            {rows.map((row, index) => {
              const top = index * ROW_HEIGHT;
              const color = row.color ?? "var(--accent)";
              const valueText = valueTextOf(row);
              const caption = row.caption ?? row.detail;
              const valueWidth = textWidth(valueText, LABEL_SIZE);
              const badgeWidth = row.badge ? textWidth(row.badge, 10) + 10 : 0;
              const labelRoom = Math.max(width - valueWidth - badgeWidth - 16, 24);
              const barWidth = Math.max(xOf(row.value), row.value > 0 ? 3 : 0);
              const active = tooltip?.title === row.label;

              return (
                <g
                  key={row.id ?? `${row.label}-${index}`}
                  pointerEvents="all"
                  onPointerEnter={() =>
                    show({
                      x: Math.min(barWidth, width - 10),
                      y: top + 18,
                      title: row.label,
                      rows: [
                        { label: "Amount", value: valueText, color },
                        ...(row.marker ? [{ label: row.marker.label, value: formatValue(row.marker.value) }] : []),
                        ...(caption ? [{ label: caption, value: "" }] : []),
                      ],
                    })
                  }
                  onPointerLeave={hide}
                >
                  <rect x={0} y={top} width={Math.max(width, 1)} height={ROW_HEIGHT} fill="transparent" />

                  <text x={0} y={top + 12} fill="var(--text-primary)" fontSize={LABEL_SIZE} fontWeight={600}>
                    {truncateToWidth(row.label, labelRoom, LABEL_SIZE)}
                  </text>
                  {row.badge && (
                    <text
                      x={truncateToWidth(row.label, labelRoom, LABEL_SIZE).length * LABEL_SIZE * 0.56 + 8}
                      y={top + 12}
                      fill={row.badgeTone === "danger" ? "var(--danger)" : "var(--text-tertiary)"}
                      fontSize={10}
                      fontWeight={700}
                    >
                      {row.badge}
                    </text>
                  )}
                  <text
                    x={width}
                    y={top + 12}
                    textAnchor="end"
                    fill={row.tone === "danger" ? "var(--danger)" : "var(--text-primary)"}
                    fontSize={LABEL_SIZE}
                    fontWeight={700}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {valueText}
                  </text>

                  <rect
                    x={0}
                    y={top + 20}
                    width={Math.max(width, 1)}
                    height={BAR_HEIGHT}
                    rx={BAR_HEIGHT / 2}
                    fill="var(--bg-inset)"
                  />
                  <path
                    d={hBarPath(0, top + 20, barWidth, BAR_HEIGHT, BAR_HEIGHT / 2)}
                    fill={color}
                    opacity={active ? 1 : 0.9}
                  />

                  {row.marker && row.marker.value > 0 && xOf(row.marker.value) <= width && (
                    <g aria-hidden="true">
                      <line
                        x1={xOf(row.marker.value)}
                        y1={top + 17}
                        x2={xOf(row.marker.value)}
                        y2={top + 33}
                        stroke="var(--text-secondary)"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                      />
                    </g>
                  )}

                  {caption && (
                    <text
                      x={0}
                      y={top + 43}
                      fill={row.tone === "danger" ? "var(--danger)" : "var(--text-tertiary)"}
                      fontSize={10}
                      fontWeight={500}
                    >
                      {truncateToWidth(caption, width, 10)}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
};
