import React from "react";
import { ChartFrame, chartName, useChartTooltip, type ChartName } from "./ChartFrame";
import { clamp, finiteValues } from "./scale";
import { useTranslation } from "../../i18n/useTranslation";

export interface HeatmapCell {
  /** Stable key, typically the ISO date. */
  key: string;
  /** Number drawn inside the cell (day of month). */
  day: number;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** Human label used by the tooltip. */
  label: string;
  /** `null` = not recorded / not yet known. 0 is a real "no spend" day. */
  value: number | null;
}

type HeatmapProps = {
  cells: HeatmapCell[];
  description?: string;
  formatValue: (value: number) => string;
  footer?: React.ReactNode;
  /** Colour of the intensity ramp; defaults to the app accent. */
  color?: string;
} & ChartName;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GAP = 4;
const HEADER = 16;
const MAX_CELL = 52;

/**
 * Calendar heatmap over a day grid.
 *
 * Three states are kept visually distinct, because they mean different things:
 *  - a value  → accent tint scaled by magnitude (one hue, light → dark);
 *  - a real 0 → a filled but neutral cell ("no spend that day");
 *  - missing  → a dashed outline ("not recorded / not yet known").
 */
export const Heatmap: React.FC<HeatmapProps> = ({
  cells,
  description,
  formatValue,
  footer,
  color = "var(--accent)",
  ...naming
}) => {
  const { t } = useTranslation();
  const { tooltip, show, hide } = useChartTooltip();

  const leadingBlanks = cells.length > 0 ? clamp(cells[0].weekday - 1, 0, 6) : 0;
  const rows = Math.max(1, Math.ceil((cells.length + leadingBlanks) / 7));
  const max = Math.max(0, ...finiteValues(cells.map((cell) => cell.value)));

  const cellSize = (width: number) => clamp((width - GAP * 6) / 7, 18, MAX_CELL);
  const heightFor = (width: number) => HEADER + rows * (cellSize(width) + GAP);

  return (
    <ChartFrame
      title={chartName(naming)}
      description={
        description ??
        cells
          .map((cell) => `${cell.label}: ${cell.value == null ? "no data" : formatValue(cell.value)}`)
          .join(", ")
      }
      height={heightFor}
      footer={footer ?? <HeatmapScale color={color} max={max} formatValue={formatValue} />}
      tooltip={tooltip}
    >
      {({ width }) => {
        const size = cellSize(width);
        const gridWidth = size * 7 + GAP * 6;
        const originX = Math.max((width - gridWidth) / 2, 0);

        return (
          <>
            <g aria-hidden="true">
              {WEEKDAYS.map((day, index) => (
                <text
                  key={day}
                  x={originX + index * (size + GAP) + size / 2}
                  y={HEADER - 6}
                  textAnchor="middle"
                  fill="var(--text-tertiary)"
                  fontSize={10}
                  fontWeight={600}
                >
                  {size < 28 ? day.slice(0, 1) : day}
                </text>
              ))}
            </g>

            {cells.map((cell, index) => {
              const position = index + leadingBlanks;
              const column = position % 7;
              const row = Math.floor(position / 7);
              const x = originX + column * (size + GAP);
              const y = HEADER + row * (size + GAP);
              const known = cell.value != null;
              const intensity = known && max > 0 ? Math.sqrt((cell.value as number) / max) : 0;
              const active = tooltip?.title === cell.label;

              return (
                <g
                  key={cell.key}
                  pointerEvents="all"
                  onPointerEnter={() =>
                    show({
                      x: x + size / 2,
                      y,
                      title: cell.label,
                      rows: [
                        {
                          label: t(known ? "chart.spend" : "chart.status"),
                          value: known ? formatValue(cell.value as number) : t("chart.notRecorded"),
                          color: known ? color : undefined,
                        },
                      ],
                    })
                  }
                  onPointerLeave={hide}
                >
                  <rect
                    x={x}
                    y={y}
                    width={size}
                    height={size}
                    rx={6}
                    fill={known ? color : "transparent"}
                    fillOpacity={known ? 0.12 + intensity * 0.78 : 0}
                    stroke={known ? "transparent" : "var(--border-strong)"}
                    strokeWidth={1}
                    strokeDasharray={known ? undefined : "3 3"}
                  />
                  {active && (
                    <rect
                      x={x}
                      y={y}
                      width={size}
                      height={size}
                      rx={6}
                      fill="none"
                      stroke="var(--text-primary)"
                      strokeWidth={1.5}
                    />
                  )}
                  <text
                    x={x + size / 2}
                    y={y + size / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={Math.min(11, size * 0.4)}
                    fontWeight={600}
                    fill={known && intensity > 0.62 ? "var(--text-inverse)" : "var(--text-secondary)"}
                  >
                    {cell.day}
                  </text>
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
};

const HeatmapScale: React.FC<{ color: string; max: number; formatValue: (value: number) => string }> = ({
  color,
  max,
  formatValue,
}) => {
  const { t } = useTranslation();
  return (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      fontSize: 11,
      color: "var(--text-tertiary)",
    }}
  >
    <span>{t("chart.noSpend")}</span>
    <span style={{ display: "flex", gap: 3 }}>
      {[0.12, 0.32, 0.52, 0.72, 0.9].map((opacity) => (
        <span
          key={opacity}
          style={{ width: 12, height: 12, borderRadius: 3, background: color, opacity }}
          aria-hidden="true"
        />
      ))}
    </span>
    <span>{max > 0 ? formatValue(max) : "—"}</span>
    <span style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          border: "1px dashed var(--border-strong)",
        }}
        aria-hidden="true"
      />
      {t("chart.notRecorded")}
    </span>
  </div>
  );
};
