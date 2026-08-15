/**
 * Pure geometry and scale maths shared by the SVG chart library.
 *
 * Deliberately free of React and DOM APIs so every helper can be unit tested
 * in isolation (see tests/analytics-charts.test.ts).
 */

/** Gap, in px, left in the surface colour between two touching marks. */
export const SURFACE_GAP = 2;

export interface Point {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Rounds a raw step up to the next "nice" number: 1, 2 or 5 times a power of
 * ten. This is what keeps gridlines readable at any magnitude — a 0–20,000
 * range gets a 5,000 step (5 lines), not 200 lines of 100.
 */
export function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 0;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = Math.pow(10, exponent);
  const residual = rawStep / magnitude; // always within [1, 10)
  const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return factor * magnitude;
}

function tickDecimals(step: number): number {
  if (step >= 1) return 0;
  return clamp(-Math.floor(Math.log10(step)), 0, 12);
}

function roundTo(value: number, decimals: number): number {
  // Rebuilding the number from its fixed representation removes the float
  // drift that accumulates when stepping (0.1 + 0.2 …).
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Gridline / axis tick values covering `[min, max]`.
 *
 * The returned ticks always use a 1/2/5×10ⁿ step, are ascending, and extend
 * just past the data on both sides so the first and last tick can also serve
 * as the axis domain. `targetCount` is a hint, never a guarantee: the nice
 * step is chosen first, so the real count lands within roughly ±2 of it.
 *
 * Degenerate inputs are handled explicitly rather than by guessing:
 *  - a non-finite bound yields `[]` (nothing can be drawn);
 *  - `min === max === 0` yields `[0]`;
 *  - `min === max === v` spans zero → v, which is what a money axis wants.
 */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

  let lo = Math.min(min, max);
  let hi = Math.max(min, max);

  if (lo === hi) {
    if (lo === 0) return [0];
    if (lo > 0) lo = 0;
    else hi = 0;
  }

  const count = Math.max(1, Math.round(Number.isFinite(targetCount) ? targetCount : 5));
  const step = niceStep((hi - lo) / count);
  if (!(step > 0)) return [roundTo(lo, 2)];

  const decimals = tickDecimals(step);
  const startIndex = Math.floor(lo / step + 1e-9);
  const endIndex = Math.ceil(hi / step - 1e-9);
  const spans = Math.max(1, endIndex - startIndex);

  const ticks: number[] = [];
  for (let i = 0; i <= spans; i += 1) {
    ticks.push(roundTo((startIndex + i) * step, decimals));
  }
  return ticks;
}

export interface NiceDomain {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * A nice axis domain plus its ticks. Charts use the tick extremes as the
 * domain so bars and gridlines share the same reference frame.
 */
export function niceDomain(min: number, max: number, targetCount = 5): NiceDomain {
  const ticks = niceTicks(min, max, targetCount);
  if (ticks.length === 0) return { min: 0, max: 1, ticks: [] };
  if (ticks.length === 1) return { min: ticks[0], max: ticks[0] + 1, ticks };
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

/** Maps a value from a data domain onto a pixel range. Constant when the domain is empty. */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (value: number) => number {
  const span = domainMax - domainMin;
  if (!Number.isFinite(span) || span === 0) return () => rangeMin;
  const factor = (rangeMax - rangeMin) / span;
  return (value: number) => rangeMin + (value - domainMin) * factor;
}

/** Short axis labels: 12.4k / 1.2M. Values below 1,000 keep their own precision. */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${trimZero(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}${trimZero(abs / 1_000)}k`;
  if (abs >= 100 || Number.isInteger(abs)) return `${sign}${Math.round(abs)}`;
  return `${sign}${trimZero(abs)}`;
}

function trimZero(value: number): string {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/**
 * Approximate width of an SVG text run. SVG has no ellipsis, so labels are
 * shortened here instead of being clipped by their own mark.
 */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

export function truncateToWidth(text: string, maxWidth: number, fontSize: number): string {
  if (maxWidth <= 0) return "";
  if (textWidth(text, fontSize) <= maxWidth) return text;
  const perChar = fontSize * 0.56;
  const room = Math.floor(maxWidth / perChar) - 1;
  if (room <= 0) return "";
  return `${text.slice(0, room).trimEnd()}…`;
}

/**
 * Keeps every `nth` label so ticks never collide on narrow screens. Returns
 * the stride, not a filtered list, so callers keep their indices.
 */
export function labelStride(count: number, availableWidth: number, labelWidth: number): number {
  if (count <= 0 || availableWidth <= 0) return 1;
  const fits = Math.max(1, Math.floor(availableWidth / Math.max(labelWidth, 1)));
  return Math.max(1, Math.ceil(count / fits));
}

/** `M…L…` path with a break wherever a point is missing (never a fabricated zero). */
export function linePath(points: (Point | null)[]): string {
  let path = "";
  let open = false;
  for (const point of points) {
    if (!point) {
      open = false;
      continue;
    }
    path += `${open ? "L" : "M"}${round2(point.x)} ${round2(point.y)} `;
    open = true;
  }
  return path.trim();
}

/** Area fills, one closed shape per contiguous run of points. */
export function areaPath(points: (Point | null)[], baselineY: number): string {
  const runs: Point[][] = [];
  let current: Point[] = [];
  for (const point of points) {
    if (!point) {
      if (current.length > 0) runs.push(current);
      current = [];
      continue;
    }
    current.push(point);
  }
  if (current.length > 0) runs.push(current);

  return runs
    .filter((run) => run.length > 1)
    .map((run) => {
      const first = run[0];
      const last = run[run.length - 1];
      const body = run.map((p) => `L${round2(p.x)} ${round2(p.y)}`).join(" ");
      return `M${round2(first.x)} ${round2(baselineY)} ${body} L${round2(last.x)} ${round2(baselineY)} Z`;
    })
    .join(" ");
}

export function polarPoint(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

/**
 * Open arc used by the gauge. Angles are clockwise degrees from 12 o'clock.
 * Combined with `pathLength={100}` the caller can dash it by percentage.
 */
export function arcPath(cx: number, cy: number, radius: number, startDeg: number, endDeg: number): string {
  const sweep = Math.abs(endDeg - startDeg);
  const start = polarPoint(cx, cy, radius, startDeg);
  const end = polarPoint(cx, cy, radius, endDeg);
  const largeArc = sweep > 180 ? 1 : 0;
  const direction = endDeg >= startDeg ? 1 : 0;
  return `M${round2(start.x)} ${round2(start.y)} A${round2(radius)} ${round2(radius)} 0 ${largeArc} ${direction} ${round2(end.x)} ${round2(end.y)}`;
}

/** Rounded-top bar path: square where it meets the baseline, soft at the data end. */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width / 2, Math.abs(height)));
  if (height <= 0) return "";
  return [
    `M${round2(x)} ${round2(y + height)}`,
    `L${round2(x)} ${round2(y + r)}`,
    `Q${round2(x)} ${round2(y)} ${round2(x + r)} ${round2(y)}`,
    `L${round2(x + width - r)} ${round2(y)}`,
    `Q${round2(x + width)} ${round2(y)} ${round2(x + width)} ${round2(y + r)}`,
    `L${round2(x + width)} ${round2(y + height)}`,
    "Z",
  ].join(" ");
}

/** Horizontal twin of `barPath`: square at the axis, rounded at the value end. */
export function hBarPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, height / 2, Math.abs(width)));
  if (width <= 0) return "";
  return [
    `M${round2(x)} ${round2(y)}`,
    `L${round2(x + width - r)} ${round2(y)}`,
    `Q${round2(x + width)} ${round2(y)} ${round2(x + width)} ${round2(y + r)}`,
    `L${round2(x + width)} ${round2(y + height - r)}`,
    `Q${round2(x + width)} ${round2(y + height)} ${round2(x + width - r)} ${round2(y + height)}`,
    `L${round2(x)} ${round2(y + height)}`,
    "Z",
  ].join(" ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Finite values only — used to derive domains without letting nulls become zeros. */
export function finiteValues(values: (number | null | undefined)[]): number[] {
  return values.filter((value): value is number => value != null && Number.isFinite(value));
}

/** Running totals that stop at the first unknown day rather than inventing one. */
export function cumulative(values: (number | null)[]): (number | null)[] {
  let total = 0;
  let started = false;
  return values.map((value) => {
    if (value == null) return null;
    total += value;
    started = true;
    return started ? total : null;
  });
}
