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

      <text
        x={cx}
        y={cy - (caption ? 8 : 2)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-primary)"
        fontSize={Math.max(24, size / 4.2)}
        fontWeight={700}
      >
        {valueText}
      </text>
      <text
        x={cx}
        y={cy + (caption ? 16 : 22)}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text-secondary)"
        fontSize={12}
        fontWeight={600}
      >
        {label}
      </text>
      {caption && (
        <text
          x={cx}
          y={cy + 33}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--text-tertiary)"
          fontSize={11}
        >
          {caption}
        </text>
      )}
    </svg>
  );
};
