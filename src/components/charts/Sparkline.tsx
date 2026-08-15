import React from "react";
import { areaPath, finiteValues, linePath, linearScale, type Point } from "./scale";

interface SparklineProps {
  /** `null` values break the line — a missing period is never plotted as 0. */
  values: (number | null)[];
  ariaLabel: string;
  width?: number;
  height?: number;
  color?: string;
  /** Wash under the line. */
  area?: boolean;
  /** Dot on the most recent known value. */
  showLast?: boolean;
  /** Stretch to the container width instead of using a fixed pixel width. */
  fluid?: boolean;
}

/**
 * Tiny inline trend, for use beside a number. No axes, no labels: the value
 * it accompanies carries the magnitude, the sparkline carries the shape.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  values,
  ariaLabel,
  width = 104,
  height = 30,
  color = "var(--accent)",
  area = true,
  showLast = true,
  fluid = false,
}) => {
  const known = finiteValues(values);
  const svgProps = {
    role: "img" as const,
    viewBox: `0 0 ${width} ${height}`,
    width: fluid ? "100%" : width,
    height,
    // Fluid sparklines stretch horizontally; strokes keep their weight via
    // vector-effect, and the end dot is dropped so nothing renders elliptical.
    preserveAspectRatio: fluid ? ("none" as const) : ("xMidYMid meet" as const),
    style: { display: "block", maxWidth: "100%" },
  };

  if (known.length === 0) {
    return (
      <svg {...svgProps} aria-label={`${ariaLabel} — no data`}>
        <title>{`${ariaLabel} — no data`}</title>
        <line
          x1={3}
          y1={height / 2}
          x2={width - 3}
          y2={height / 2}
          stroke="var(--border-strong)"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const min = Math.min(...known, 0);
  const rawMax = Math.max(...known);
  const yOf = linearScale(min, rawMax === min ? min + 1 : rawMax, height - 3, 3);
  const step = values.length > 1 ? (width - 6) / (values.length - 1) : 0;
  const points: (Point | null)[] = values.map((value, index) =>
    value == null ? null : { x: 3 + index * step, y: yOf(value) },
  );

  const lastIndex = points.reduce<number>((found, point, index) => (point ? index : found), -1);
  const last = lastIndex >= 0 ? (points[lastIndex] as Point) : null;

  return (
    <svg {...svgProps} aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      {area && <path d={areaPath(points, height)} fill={color} opacity={0.12} stroke="none" />}
      <path
        d={linePath(points)}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showLast && !fluid && last && <circle cx={last.x} cy={last.y} r={2.5} fill={color} />}
    </svg>
  );
};
