import React from "react";
import { useTranslation } from "../../i18n/useTranslation";
import {
  CategoryAxis,
  ChartFrame,
  GridLines,
  MissingMark,
  ReferenceLineMark,
  chartName,
  useChartTooltip,
  type ChartName,
} from "./ChartFrame";
import type { ChartReferenceLine } from "./LineChart";
import { SURFACE_GAP, barPath, finiteValues, linearScale, niceDomain } from "./scale";

export interface ChartBar {
  label: string;
  /** `null` renders as "?" — an unrecorded period is unknown, not zero. */
  value: number | null;
  highlight?: boolean;
  /** Overrides the default emphasis colouring (e.g. a category's own colour). */
  color?: string;
  detail?: string;
}

type BarChartProps = {
  bars: ChartBar[];
  description?: string;
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  height?: number;
  referenceLines?: ChartReferenceLine[];
  minWidth?: number;
  footer?: React.ReactNode;
} & ChartName;

const PAD = { top: 16, right: 14, bottom: 22, left: 46 };
const MAX_BAR = 24;

/**
 * Vertical bars with an emphasis treatment: the selected period is drawn in
 * the accent colour, the rest recede so the comparison reads at a glance.
 */
export const BarChart: React.FC<BarChartProps> = ({
  bars,
  description,
  formatValue,
  formatTick,
  height = 200,
  referenceLines = [],
  minWidth,
  footer,
  ...naming
}) => {
  const { t } = useTranslation();
  const { tooltip, show, hide } = useChartTooltip();
  const tickFormat = formatTick ?? formatValue;
  const emphasisIndex = bars.findIndex((bar) => bar.highlight);

  return (
    <ChartFrame
      title={chartName(naming)}
      description={
        description ??
        bars
          .map((bar) => `${bar.label}: ${bar.value == null ? "no data" : formatValue(bar.value)}`)
          .join(", ")
      }
      height={height}
      minWidth={minWidth}
      legend={
        referenceLines.length > 0
          ? referenceLines.map((line, index) => ({
              id: `ref-${index}`,
              label: line.label,
              color: line.color ?? "var(--text-secondary)",
              dashed: true,
            }))
          : undefined
      }
      footer={footer}
      tooltip={tooltip}
    >
      {({ width }) => {
        const left = PAD.left;
        const right = Math.max(width - PAD.right, left + 10);
        const top = PAD.top;
        const bottom = height - PAD.bottom;
        const plotWidth = right - left;
        const band = bars.length > 0 ? plotWidth / bars.length : plotWidth;
        const barWidth = Math.max(3, Math.min(MAX_BAR, band - Math.max(SURFACE_GAP, band * 0.3)));

        const values = finiteValues(bars.map((bar) => bar.value));
        const referenceValues = referenceLines.map((line) => line.value);
        const domain = niceDomain(0, Math.max(0, ...values, ...referenceValues), 4);
        const yOf = linearScale(domain.min, domain.max, bottom, top);
        const xOf = (index: number) => left + band * (index + 0.5);

        return (
          <>
            <GridLines ticks={domain.ticks} yOf={yOf} left={left} right={right} format={tickFormat} />

            {referenceLines.map((line, index) => (
              <ReferenceLineMark
                key={`ref-${index}`}
                y={yOf(line.value)}
                left={left}
                right={right}
                label={line.label}
                color={line.color}
              />
            ))}

            {bars.map((bar, index) => {
              const cx = xOf(index);
              if (bar.value == null) {
                return (
                  <g key={`${bar.label}-${index}`}>
                    <line
                      x1={cx}
                      y1={bottom}
                      x2={cx}
                      y2={bottom - 14}
                      stroke="var(--border-strong)"
                      strokeWidth={1}
                      strokeDasharray="2 3"
                    />
                    <MissingMark x={cx} y={bottom - 22} />
                  </g>
                );
              }

              const y = yOf(bar.value);
              const barHeight = Math.max(bottom - y, bar.value > 0 ? 2 : 1);
              const fill = bar.color ?? "var(--accent)";
              const isActive = tooltip?.title === bar.label;
              const opacity = bar.color ? (bar.highlight === false ? 0.55 : 1) : bar.highlight ? 1 : 0.32;

              return (
                <path
                  key={`${bar.label}-${index}`}
                  d={barPath(cx - barWidth / 2, bottom - barHeight, barWidth, barHeight, 4)}
                  fill={fill}
                  opacity={isActive ? Math.min(opacity + 0.25, 1) : opacity}
                  pointerEvents="all"
                  onPointerEnter={() =>
                    show({
                      x: cx,
                      y: bottom - barHeight,
                      title: bar.label,
                      rows: [
                        { label: t("chart.spend"), value: formatValue(bar.value as number), color: fill },
                        ...(bar.detail ? [{ label: bar.detail, value: "" }] : []),
                      ],
                    })
                  }
                  onPointerLeave={hide}
                />
              );
            })}

            <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--border-strong)" strokeWidth={1} />

            <CategoryAxis
              labels={bars.map((bar) => bar.label)}
              xOf={xOf}
              y={height - 6}
              bandWidth={band}
              emphasisIndex={emphasisIndex >= 0 ? emphasisIndex : undefined}
            />
          </>
        );
      }}
    </ChartFrame>
  );
};
