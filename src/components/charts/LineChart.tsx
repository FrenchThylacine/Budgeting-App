import React from "react";
import {
  CategoryAxis,
  ChartFrame,
  GridLines,
  ReferenceLineMark,
  chartName,
  useChartTooltip,
  type ChartName,
  type LegendItem,
} from "./ChartFrame";
import { areaPath, clamp, finiteValues, linePath, linearScale, niceDomain, type Point } from "./scale";

export interface LineSeries {
  id: string;
  /** Series name. `label` is accepted as an alias. */
  name?: string;
  label?: string;
  color: string;
  /**
   * One value per label; `points` is accepted as an alias. `null` is a gap:
   * an unknown period is never drawn as 0.
   */
  values?: (number | null)[];
  points?: (number | null)[];
  /** Wash the area under the line at 10% opacity. */
  area?: boolean;
  /** Dashed stroke — used for projections, which are estimates, not records. */
  dashed?: boolean;
}

interface ResolvedSeries {
  id: string;
  name: string;
  color: string;
  values: (number | null)[];
  area?: boolean;
  dashed?: boolean;
}

function resolveSeries(series: LineSeries[]): ResolvedSeries[] {
  return series.map((item) => ({
    id: item.id,
    name: item.name ?? item.label ?? item.id,
    color: item.color,
    values: item.values ?? item.points ?? [],
    area: item.area,
    dashed: item.dashed,
  }));
}

export interface ChartReferenceLine {
  value: number;
  label: string;
  color?: string;
}

type LineChartProps = {
  /** X labels. Defaults to 1..n when the caller only has series values. */
  labels?: string[];
  series: LineSeries[];
  description?: string;
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  height?: number;
  referenceLines?: ChartReferenceLine[];
  /** Index that gets a visible marker, e.g. the globally selected period. */
  emphasisIndex?: number;
  showLegend?: boolean;
  minWidth?: number;
  footer?: React.ReactNode;
} & ChartName;

const PAD = { top: 16, right: 14, bottom: 22, left: 46 };

/**
 * Multi-series line / area chart.
 *
 * Missing values break the line rather than dropping it to zero, so an
 * unrecorded month reads as "unknown" — the app's core financial rule.
 */
export const LineChart: React.FC<LineChartProps> = ({
  labels: labelsInput,
  series: seriesInput,
  description,
  formatValue,
  formatTick,
  height = 220,
  referenceLines = [],
  emphasisIndex,
  showLegend = true,
  minWidth,
  footer,
  ...naming
}) => {
  const { tooltip, show, hide } = useChartTooltip();
  const tickFormat = formatTick ?? formatValue;
  const series = resolveSeries(seriesInput);
  const labels =
    labelsInput ??
    Array.from({ length: Math.max(0, ...series.map((item) => item.values.length)) }, (_, index) =>
      String(index + 1),
    );

  const legend: LegendItem[] = series
    // A series with nothing to draw (e.g. a projection for a finished month)
    // gets no key — a legend entry with no mark on the chart is noise.
    .filter((item) => finiteValues(item.values).length > 0)
    .map((item) => ({ id: item.id, label: item.name, color: item.color, dashed: item.dashed }))
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
      description={description ?? buildDescription(labels, series, formatValue)}
      height={height}
      minWidth={minWidth}
      legend={showLegend && legend.length > 1 ? legend : undefined}
      footer={footer}
      tooltip={tooltip}
    >
      {({ width }) => {
        const left = PAD.left;
        const right = Math.max(width - PAD.right, left + 10);
        const top = PAD.top;
        const bottom = height - PAD.bottom;
        const plotWidth = right - left;

        const values = series.flatMap((item) => finiteValues(item.values));
        const referenceValues = referenceLines.map((line) => line.value);
        const domain = niceDomain(
          Math.min(0, ...values, ...referenceValues),
          Math.max(0, ...values, ...referenceValues),
          4,
        );
        const yOf = linearScale(domain.min, domain.max, bottom, top);
        const xOf = (index: number) =>
          labels.length <= 1 ? left + plotWidth / 2 : left + (index * plotWidth) / (labels.length - 1);

        const pointsFor = (item: ResolvedSeries): (Point | null)[] =>
          item.values.map((value, index) => (value == null ? null : { x: xOf(index), y: yOf(value) }));

        const handleMove = (event: React.PointerEvent<SVGRectElement>) => {
          const svg = event.currentTarget.ownerSVGElement;
          if (!svg || labels.length === 0) return;
          const rect = svg.getBoundingClientRect();
          const scale = rect.width > 0 ? width / rect.width : 1;
          const x = (event.clientX - rect.left) * scale;
          const step = labels.length <= 1 ? plotWidth : plotWidth / (labels.length - 1);
          const index = clamp(Math.round((x - left) / (step || 1)), 0, labels.length - 1);

          const rows = series.map((item) => ({
            label: item.name,
            value: item.values[index] == null ? "No data" : formatValue(item.values[index] as number),
            color: item.color,
          }));
          const highest = Math.min(
            ...series.map((item) => (item.values[index] == null ? bottom : yOf(item.values[index] as number))),
          );
          show({ x: xOf(index), y: Number.isFinite(highest) ? highest : bottom, title: labels[index], rows });
        };

        const hoverIndex = tooltip ? labels.indexOf(tooltip.title) : -1;

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

            {series.map((item) => {
              const points = pointsFor(item);
              return (
                <g key={item.id}>
                  {item.area && (
                    <path d={areaPath(points, bottom)} fill={item.color} opacity={0.1} stroke="none" />
                  )}
                  <path
                    d={linePath(points)}
                    fill="none"
                    stroke={item.color}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={item.dashed ? "5 5" : undefined}
                  />
                </g>
              );
            })}

            {hoverIndex >= 0 && (
              <line
                x1={xOf(hoverIndex)}
                y1={top}
                x2={xOf(hoverIndex)}
                y2={bottom}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
            )}

            {series.map((item) =>
              item.values.map((value, index) => {
                if (value == null) return null;
                const isHover = index === hoverIndex;
                const isEmphasis = index === emphasisIndex;
                const isLast = index === lastKnownIndex(item.values);
                if (!isHover && !isEmphasis && !isLast) return null;
                return (
                  <circle
                    key={`${item.id}-${index}`}
                    cx={xOf(index)}
                    cy={yOf(value)}
                    r={isHover ? 5 : 4}
                    fill={item.color}
                    stroke="var(--bg-elevated)"
                    strokeWidth={2}
                  />
                );
              }),
            )}

            <CategoryAxis
              labels={labels}
              xOf={xOf}
              y={height - 6}
              bandWidth={labels.length > 0 ? plotWidth / labels.length : plotWidth}
              emphasisIndex={emphasisIndex}
            />

            <rect
              x={left}
              y={top}
              width={Math.max(plotWidth, 1)}
              height={Math.max(bottom - top, 1)}
              fill="transparent"
              pointerEvents="all"
              onPointerMove={handleMove}
              onPointerLeave={hide}
            />
          </>
        );
      }}
    </ChartFrame>
  );
};

function lastKnownIndex(values: (number | null)[]): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] != null) return index;
  }
  return -1;
}

function buildDescription(
  labels: string[],
  series: ResolvedSeries[],
  formatValue: (value: number) => string,
): string {
  return series
    .map((item) => {
      const points = item.values
        .map((value, index) => `${labels[index] ?? index + 1}: ${value == null ? "no data" : formatValue(value)}`)
        .join(", ");
      return `${item.name} — ${points}`;
    })
    .join(". ");
}
