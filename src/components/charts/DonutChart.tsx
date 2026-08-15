import React from "react";
import {
  ChartFrame,
  ChartPlaceholder,
  chartName,
  useChartTooltip,
  type ChartName,
  type LegendItem,
} from "./ChartFrame";
import { polarPoint } from "./scale";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

type DonutChartProps = {
  segments: DonutSegment[];
  /** Large figure in the middle of the ring. */
  centerValue: string;
  /** Caption under the centre figure. */
  centerLabel: string;
  description?: string;
  formatValue: (value: number) => string;
  size?: number;
  thickness?: number;
  footer?: React.ReactNode;
  emptyMessage?: string;
} & ChartName;

/**
 * Part-to-whole at a glance. Kept to a handful of segments on purpose —
 * a donut cannot rank close values, so anything comparative belongs in bars.
 */
export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  centerValue,
  centerLabel,
  description,
  formatValue,
  size = 200,
  thickness = 22,
  footer,
  emptyMessage = "No spending recorded for this period.",
  ...naming
}) => {
  const { tooltip, show, hide } = useChartTooltip();
  const drawable = segments.filter((segment) => segment.value > 0);
  const total = drawable.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) return <ChartPlaceholder height={size} message={emptyMessage} />;

  const legend: LegendItem[] = drawable.map((segment) => ({
    id: segment.id,
    label: segment.label,
    color: segment.color,
    value: `${((segment.value / total) * 100).toFixed(0)}%`,
  }));

  return (
    <ChartFrame
      title={chartName(naming)}
      description={
        description ??
        drawable
          .map((segment) => `${segment.label}: ${formatValue(segment.value)} (${((segment.value / total) * 100).toFixed(0)}%)`)
          .join(", ")
      }
      height={size}
      legend={legend}
      footer={footer}
      tooltip={tooltip}
    >
      {({ width }) => {
        const cx = width / 2;
        const cy = size / 2;
        const radius = Math.max((Math.min(size, width) - thickness) / 2 - 4, 10);
        const circumference = 2 * Math.PI * radius;
        // A 2px gap in the surface colour separates neighbouring arcs.
        const gapPct = drawable.length > 1 ? Math.min((2 / circumference) * 100, 2) : 0;

        let offset = 0;
        return (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="var(--bg-inset)"
              strokeWidth={thickness}
              opacity={0.7}
            />
            {drawable.map((segment) => {
              const pct = (segment.value / total) * 100;
              const dash = Math.max(pct - gapPct, 0.4);
              const start = offset;
              offset += pct;
              const midAngle = (start + pct / 2) * 3.6;
              const anchor = polarPoint(cx, cy, radius, midAngle);
              const dimmed = tooltip != null && tooltip.title !== segment.label;

              return (
                <circle
                  key={segment.id}
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={thickness}
                  strokeLinecap="butt"
                  pathLength={100}
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={-start}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  opacity={dimmed ? 0.45 : 1}
                  pointerEvents="stroke"
                  onPointerEnter={() =>
                    show({
                      x: anchor.x,
                      y: anchor.y,
                      title: segment.label,
                      rows: [
                        { label: "Amount", value: formatValue(segment.value), color: segment.color },
                        { label: "Share", value: `${pct.toFixed(1)}%` },
                      ],
                    })
                  }
                  onPointerLeave={hide}
                />
              );
            })}

            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-primary)"
              fontSize={Math.max(16, Math.min(26, size / 8))}
              fontWeight={700}
            >
              {centerValue}
            </text>
            <text
              x={cx}
              y={cy + 16}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-tertiary)"
              fontSize={11}
              fontWeight={600}
            >
              {centerLabel}
            </text>
          </>
        );
      }}
    </ChartFrame>
  );
};
