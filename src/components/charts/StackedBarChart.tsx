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
  type LegendItem,
} from "./ChartFrame";
import type { ChartReferenceLine } from "./LineChart";
import { SURFACE_GAP, barPath, linearScale, niceDomain } from "./scale";

export interface StackSeries {
  id: string;
  name: string;
  color: string;
  /** One value per label. `null` means "not recorded" and adds nothing to the stack. */
  values: (number | null)[];
}

type StackedBarChartProps = {
  labels: string[];
  series: StackSeries[];
  description?: string;
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  height?: number;
  referenceLines?: ChartReferenceLine[];
  minWidth?: number;
  footer?: React.ReactNode;
  emphasisIndex?: number;
} & ChartName;

const PAD = { top: 16, right: 14, bottom: 22, left: 46 };
const MAX_BAR = 28;

/**
 * Part-to-whole over time. Segments are separated by a gap in the surface
 * colour rather than a stroke, so no ink is added that isn't data.
 *
 * A column where every series is missing renders as "?", never as an empty
 * (and therefore zero-looking) column.
 */
export const StackedBarChart: React.FC<StackedBarChartProps> = ({
  labels,
  series,
  description,
  formatValue,
  formatTick,
  height = 220,
  referenceLines = [],
  minWidth,
  footer,
  emphasisIndex,
  ...naming
}) => {
  const { t } = useTranslation();
  const { tooltip, show, hide } = useChartTooltip();
  const tickFormat = formatTick ?? formatValue;

  const totals = labels.map((_, index) => {
    const parts = series.map((item) => item.values[index]);
    if (parts.every((value) => value == null)) return null;
    return parts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  });

  const legend: LegendItem[] = series
    .map((item) => ({ id: item.id, label: item.name, color: item.color }))
    .concat(
      referenceLines.map((line, index) => ({
        id: `ref-${index}`,
        label: line.label,
        color: line.color ?? "var(--text-secondary)",
        dashed: true,
      })),
    );

  return (
    <ChartFrame
      title={chartName(naming)}
      description={
        description ??
        labels
          .map((label, index) => `${label}: ${totals[index] == null ? "no data" : formatValue(totals[index] as number)}`)
          .join(", ")
      }
      height={height}
      minWidth={minWidth}
      legend={legend}
      footer={footer}
      tooltip={tooltip}
    >
      {({ width }) => {
        const left = PAD.left;
        const right = Math.max(width - PAD.right, left + 10);
        const top = PAD.top;
        const bottom = height - PAD.bottom;
        const plotWidth = right - left;
        const band = labels.length > 0 ? plotWidth / labels.length : plotWidth;
        const barWidth = Math.max(4, Math.min(MAX_BAR, band - Math.max(SURFACE_GAP, band * 0.3)));

        const maxTotal = Math.max(
          0,
          ...totals.filter((value): value is number => value != null),
          ...referenceLines.map((line) => line.value),
        );
        const domain = niceDomain(0, maxTotal, 4);
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

            {labels.map((label, index) => {
              const cx = xOf(index);
              const total = totals[index];
              if (total == null) {
                return (
                  <g key={`${label}-${index}`}>
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

              // The top-most drawn segment is the stack's data end, so only it
              // gets the rounded cap; interior joins stay square.
              const topSegment = series.reduce(
                (found, item, seriesIndex) => ((item.values[index] ?? 0) > 0 ? seriesIndex : found),
                -1,
              );
              let cursor = bottom;
              const segments = series.map((item, seriesIndex) => {
                const value = item.values[index] ?? 0;
                const segmentHeight = Math.max(bottom - yOf(value) - SURFACE_GAP, value > 0 ? 1 : 0);
                const y = cursor - segmentHeight;
                cursor -= segmentHeight + SURFACE_GAP;
                return { item, value, y, segmentHeight, radius: seriesIndex === topSegment ? 3 : 0 };
              });

              return (
                <g
                  key={`${label}-${index}`}
                  pointerEvents="all"
                  onPointerEnter={() =>
                    show({
                      x: cx,
                      y: yOf(total),
                      title: label,
                      rows: [
                        ...series.map((item) => ({
                          label: item.name,
                          value: item.values[index] == null ? "No data" : formatValue(item.values[index] as number),
                          color: item.color,
                        })),
                        { label: t("chart.total"), value: formatValue(total) },
                      ],
                    })
                  }
                  onPointerLeave={hide}
                >
                  <rect x={cx - band / 2} y={top} width={band} height={Math.max(bottom - top, 1)} fill="transparent" />
                  {segments.map(({ item, value, y, segmentHeight, radius }) =>
                    segmentHeight <= 0 || value <= 0 ? null : (
                      <path
                        key={item.id}
                        d={barPath(cx - barWidth / 2, y, barWidth, segmentHeight, radius)}
                        fill={item.color}
                        opacity={tooltip && tooltip.title !== label ? 0.55 : 1}
                      />
                    ),
                  )}
                </g>
              );
            })}

            <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--border-strong)" strokeWidth={1} />

            <CategoryAxis
              labels={labels}
              xOf={xOf}
              y={height - 6}
              bandWidth={band}
              emphasisIndex={emphasisIndex}
            />
          </>
        );
      }}
    </ChartFrame>
  );
};
