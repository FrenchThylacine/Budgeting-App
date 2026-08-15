/**
 * Dependency-free SVG chart library.
 *
 * Every chart here is: responsive (viewBox sized from the measured container),
 * theme-aware (colours come from CSS custom properties, never hard-coded hex),
 * accessible (role="img" + aria-label + <title>/<desc>), and honest about
 * missing data (a gap or "?", never a fabricated zero).
 */

export { BarChart } from "./BarChart";
export type { ChartBar } from "./BarChart";

export {
  CategoryAxis,
  ChartFrame,
  ChartLegend,
  ChartPlaceholder,
  GridLines,
  MissingMark,
  ReferenceLineMark,
  chartName,
  useChartTooltip,
  useElementWidth,
} from "./ChartFrame";
export type { ChartName, ChartSize, LegendItem, TooltipRow, TooltipState } from "./ChartFrame";

export { DonutChart } from "./DonutChart";
export type { DonutSegment } from "./DonutChart";

export { Heatmap } from "./Heatmap";
export type { HeatmapCell } from "./Heatmap";

export { HorizontalBarChart } from "./HorizontalBarChart";
export type { HorizontalBarRow } from "./HorizontalBarChart";

export { LineChart } from "./LineChart";
export type { ChartReferenceLine, LineSeries } from "./LineChart";

export { ProgressRing } from "./ProgressRing";

export { Sparkline } from "./Sparkline";

export { StackedBarChart } from "./StackedBarChart";
export type { StackSeries } from "./StackedBarChart";

export {
  areaPath,
  arcPath,
  barPath,
  clamp,
  compactNumber,
  cumulative,
  finiteValues,
  hBarPath,
  labelStride,
  linePath,
  linearScale,
  niceDomain,
  niceStep,
  niceTicks,
  polarPoint,
  textWidth,
  truncateToWidth,
  SURFACE_GAP,
} from "./scale";
export type { NiceDomain, Point } from "./scale";
