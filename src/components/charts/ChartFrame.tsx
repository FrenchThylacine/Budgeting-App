import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { clamp, labelStride, truncateToWidth } from "./scale";

/**
 * Shared chrome for every chart in this library.
 *
 * Responsibilities:
 *  - measure the available width so the SVG viewBox matches real pixels
 *    (text stays crisp instead of being scaled down on narrow screens);
 *  - keep wide charts inside their own horizontal scroller so they can never
 *    widen the page — the app must not scroll sideways at 320px;
 *  - carry the accessible name: role="img" + aria-label + <title>/<desc>.
 */

export interface ChartSize {
  width: number;
  height: number;
}

/**
 * Every chart must carry an accessible name. Callers may spell it `title`
 * (it is also the SVG <title>) or `ariaLabel`; the union requires exactly one
 * of them to be present, so a chart can never ship unnamed.
 */
export type ChartName =
  | { title: string; ariaLabel?: string }
  | { title?: string; ariaLabel: string };

export function chartName(props: { title?: string; ariaLabel?: string }): string {
  return props.ariaLabel ?? props.title ?? "Chart";
}

export interface LegendItem {
  id: string;
  label: string;
  color: string;
  /** Rendered as a dashed key — used for projections and reference lines. */
  dashed?: boolean;
  value?: string;
}

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export interface TooltipState {
  x: number;
  y: number;
  title: string;
  rows: TooltipRow[];
}

/** Measures an element, falling back to a sensible width before layout runs. */
export function useElementWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () => {
      const next = element.clientWidth;
      if (next > 0) setWidth(next);
    };
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Tooltip state helper: charts only decide *what* to show, never *where* to clip. */
export function useChartTooltip(): {
  tooltip: TooltipState | null;
  show: (state: TooltipState) => void;
  hide: () => void;
} {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const show = useCallback((state: TooltipState) => setTooltip(state), []);
  const hide = useCallback(() => setTooltip(null), []);
  useEffect(() => () => setTooltip(null), []);
  return { tooltip, show, hide };
}

interface ChartFrameProps {
  /** Accessible name; also the SVG <title>. */
  title: string;
  /** Longer summary for screen readers; the SVG <desc>. */
  description?: string;
  /** Fixed height, or one derived from the measured width (grids, calendars). */
  height: number | ((width: number) => number);
  /** Minimum drawing width; the frame scrolls horizontally below it. */
  minWidth?: number;
  legend?: LegendItem[];
  footer?: React.ReactNode;
  tooltip?: TooltipState | null;
  children: (size: ChartSize) => React.ReactNode;
}

export const ChartFrame: React.FC<ChartFrameProps> = ({
  title,
  description,
  height: heightInput,
  minWidth,
  legend,
  footer,
  tooltip,
  children,
}) => {
  const [ref, measured] = useElementWidth<HTMLDivElement>(minWidth ?? 480);
  const width = Math.max(measured, minWidth ?? 0);
  const height = typeof heightInput === "function" ? heightInput(width) : heightInput;

  return (
    <figure style={{ margin: 0, display: "grid", gap: 10, minWidth: 0 }}>
      <div
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          maxWidth: "100%",
          // Momentum scrolling on touch without the page ever moving sideways.
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div ref={ref} style={{ position: "relative", width: "100%", minWidth: minWidth ?? undefined }}>
          <svg
            role="img"
            aria-label={title}
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: "block", overflow: "visible" }}
          >
            <title>{title}</title>
            {description && <desc>{description}</desc>}
            {children({ width, height })}
          </svg>
          {tooltip && <ChartTooltip tooltip={tooltip} containerWidth={width} />}
        </div>
      </div>
      {legend && legend.length > 0 && <ChartLegend items={legend} />}
      {footer && <figcaption style={{ minWidth: 0 }}>{footer}</figcaption>}
    </figure>
  );
};

const TOOLTIP_WIDTH = 172;

const ChartTooltip: React.FC<{ tooltip: TooltipState; containerWidth: number }> = ({ tooltip, containerWidth }) => {
  const half = TOOLTIP_WIDTH / 2;
  const left =
    containerWidth > TOOLTIP_WIDTH ? clamp(tooltip.x, half + 4, containerWidth - half - 4) : containerWidth / 2;

  return (
    <div
      role="presentation"
      style={{
        position: "absolute",
        left,
        top: tooltip.y,
        transform: "translate(-50%, calc(-100% - 10px))",
        pointerEvents: "none",
        maxWidth: TOOLTIP_WIDTH,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-md)",
        padding: "8px 10px",
        display: "grid",
        gap: 4,
        zIndex: 5,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>{tooltip.title}</div>
      {tooltip.rows.map((row, index) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {row.color && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: row.color,
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
            }}
          >
            {row.label}
          </span>
          <strong style={{ fontSize: 12, marginLeft: "auto", whiteSpace: "nowrap" }}>{row.value}</strong>
        </div>
      ))}
    </div>
  );
};

export const ChartLegend: React.FC<{ items: LegendItem[] }> = ({ items }) => (
  <ul
    style={{
      listStyle: "none",
      margin: 0,
      padding: 0,
      display: "flex",
      flexWrap: "wrap",
      gap: "6px 14px",
      minWidth: 0,
    }}
  >
    {items.map((item) => (
      <li key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        {item.dashed ? (
          <svg width={14} height={8} aria-hidden="true" style={{ flexShrink: 0 }}>
            <line
              x1={0}
              y1={4}
              x2={14}
              y2={4}
              stroke={item.color}
              strokeWidth={2}
              strokeDasharray="3 3"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <span
            aria-hidden="true"
            style={{ width: 10, height: 10, borderRadius: 3, background: item.color, flexShrink: 0 }}
          />
        )}
        <span
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.label}
        </span>
        {item.value && (
          <strong style={{ fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{item.value}</strong>
        )}
      </li>
    ))}
  </ul>
);

/** Horizontal gridlines plus their value labels. Hairline, solid, recessive. */
export const GridLines: React.FC<{
  ticks: number[];
  yOf: (value: number) => number;
  left: number;
  right: number;
  format: (value: number) => string;
}> = ({ ticks, yOf, left, right, format }) => (
  <g aria-hidden="true">
    {ticks.map((tick) => {
      const y = yOf(tick);
      return (
        <g key={tick}>
          <line x1={left} y1={y} x2={right} y2={y} stroke="var(--border)" strokeWidth={1} shapeRendering="crispEdges" />
          <text
            x={left - 6}
            y={y}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--text-tertiary)"
            fontSize={10}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {format(tick)}
          </text>
        </g>
      );
    })}
  </g>
);

/**
 * A labelled threshold — e.g. "Budget €2,000". Dashed and low-contrast on
 * purpose: it is context for the data, never the loudest thing on the chart.
 */
export const ReferenceLineMark: React.FC<{
  y: number;
  left: number;
  right: number;
  label: string;
  color?: string;
}> = ({ y, left, right, label, color = "var(--text-secondary)" }) => {
  const labelWidth = Math.min(label.length * 6 + 12, Math.max(right - left, 40));
  const anchorRight = right - 2;
  return (
    <g aria-hidden="true">
      <line
        x1={left}
        y1={y}
        x2={right}
        y2={y}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="5 4"
        opacity={0.65}
      />
      <rect
        x={anchorRight - labelWidth}
        y={y - 15}
        width={labelWidth}
        height={13}
        rx={4}
        fill="var(--bg-elevated)"
        opacity={0.9}
      />
      <text
        x={anchorRight - 6}
        y={y - 5}
        textAnchor="end"
        fill={color}
        fontSize={10}
        fontWeight={600}
        opacity={0.9}
      >
        {truncateToWidth(label, labelWidth - 12, 10)}
      </text>
    </g>
  );
};

/** The "?" placeholder: an unrecorded period is unknown, never a zero. */
export const MissingMark: React.FC<{ x: number; y: number; size?: number }> = ({ x, y, size = 11 }) => (
  <text
    x={x}
    y={y}
    textAnchor="middle"
    dominantBaseline="middle"
    fill="var(--text-tertiary)"
    fontSize={size}
    fontWeight={600}
    aria-hidden="true"
  >
    ?
  </text>
);

/** X-axis category labels, thinned so they never collide. */
export const CategoryAxis: React.FC<{
  labels: string[];
  xOf: (index: number) => number;
  y: number;
  bandWidth: number;
  emphasisIndex?: number;
}> = ({ labels, xOf, y, bandWidth, emphasisIndex }) => {
  const stride = labelStride(labels.length, bandWidth * labels.length, 30);
  return (
    <g aria-hidden="true">
      {labels.map((label, index) => {
        const emphasised = index === emphasisIndex;
        if (!emphasised && index % stride !== 0) return null;
        return (
          <text
            key={`${label}-${index}`}
            x={xOf(index)}
            y={y}
            textAnchor="middle"
            fill={emphasised ? "var(--text-primary)" : "var(--text-tertiary)"}
            fontSize={10}
            fontWeight={emphasised ? 700 : 500}
          >
            {truncateToWidth(label, Math.max(bandWidth * stride, 24), 10)}
          </text>
        );
      })}
    </g>
  );
};

/** Shared placeholder for "there is genuinely nothing to plot". */
export const ChartPlaceholder: React.FC<{ height: number; message: string }> = ({ height, message }) => (
  <div
    style={{
      height,
      display: "grid",
      placeItems: "center",
      background: "var(--bg-subtle)",
      border: "1px dashed var(--border-strong)",
      borderRadius: "var(--radius-md)",
      color: "var(--text-tertiary)",
      fontSize: 13,
      textAlign: "center",
      padding: 16,
    }}
  >
    {message}
  </div>
);
