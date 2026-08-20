import React from "react";
import { arcPath, clamp, polarPoint } from "./scale";

interface ProgressRingProps {
  /** Current value; clamped into [0, max] for the arc but shown as given. */
  value: number | null;
  max?: number;
  /** Large figure at the centre — pre-formatted by the caller. */
  valueText: string;
  /** Caption under the figure. */
  label: string;
  /** Optional third line, e.g. what drives the score. */
  caption?: string;
  ariaLabel: string;
  size?: number;
  thickness?: number;
  /** Degrees of arc: 270 reads as a gauge, 360 as a full ring. */
  sweep?: number;
  color?: string;
  /** Labels at the two ends of the scale (gauge mode). */
  scaleLabels?: [string, string];
  /** Overrides the figure's colour; defaults to the primary text colour. */
  valueColor?: string;
  /** Overrides the grade's colour, so the word carries the same tone as the arc. */
  labelColor?: string;
}

/**
 * Gauge / progress ring for a single headline ratio — the one number a panel
 * leads with. Deliberately large: it is the anchor of the Overview section.
 *
 * A `null` value renders an empty track and a "—" figure rather than a
 * misleading zero-length arc.
 */
export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  max = 100,
  valueText,
  label,
  caption,
  ariaLabel,
  size = 190,
  thickness = 14,
  sweep = 270,
  color = "var(--accent)",
  scaleLabels,
  valueColor,
  labelColor,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - thickness / 2 - 2;
  const start = -sweep / 2;
  const end = sweep / 2;
  const track = sweep >= 360 ? null : arcPath(cx, cy, radius, start, end);
  const pct = value == null || max <= 0 ? 0 : clamp((value / max) * 100, 0, 100);

  const startPoint = polarPoint(cx, cy, radius, start);
  const endPoint = polarPoint(cx, cy, radius, end);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      height={size}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: "block", maxWidth: size, margin: "0 auto" }}
    >
      <title>{ariaLabel}</title>

      {track ? (
        <>
          <path
            d={track}
            fill="none"
            stroke="var(--bg-inset)"
            strokeWidth={thickness}
            strokeLinecap="round"
          />
          {value != null && (
            <path
              d={track}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${pct} ${100 - pct}`}
            />
          )}
        </>
      ) : (
        <>
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--bg-inset)" strokeWidth={thickness} />
          {value != null && (
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${pct} ${100 - pct}`}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )}
        </>
      )}

      {scaleLabels && sweep < 360 && (
        <g aria-hidden="true" fill="var(--text-tertiary)" fontSize={10} fontWeight={600}>
          <text x={startPoint.x} y={startPoint.y + thickness + 6} textAnchor="middle">
            {scaleLabels[0]}
          </text>
          <text x={endPoint.x} y={endPoint.y + thickness + 6} textAnchor="middle">
            {scaleLabels[1]}
          </text>
        </g>
      )}

      {/* The figure is the point of the gauge, so it is sized as the headline
          of the panel rather than as a caption inside a graphic. At 210px it
          reads at ~68px — the old size/4.2 gave 50px, which lost to the words
          beside it. Tabular figures keep 8 and 92 the same optical weight. */}
      <text
        x={cx}
        y={cy - (label ? size * 0.045 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={valueColor ?? "var(--text-primary)"}
        fontSize={Math.max(30, size / 3.05)}
        fontWeight={700}
        letterSpacing={-size / 110}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {valueText}
      </text>
      {/* The grade, set as a small-caps rule under the number: it is the word
          the figure means, not a footnote about it. */}
      <text
        x={cx}
        y={cy + size * 0.135}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={labelColor ?? "var(--text-secondary)"}
        fontSize={Math.max(11, size / 15)}
        fontWeight={700}
        letterSpacing={size / 160}
        style={{ textTransform: "uppercase" }}
      >
        {label}
      </text>
      {caption && (
        <text
          x={cx}
          y={cy + size * 0.225}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-tertiary)"
          fontSize={Math.max(10, size / 19)}
        >
          {caption}
        </text>
      )}
    </svg>
  );
};
