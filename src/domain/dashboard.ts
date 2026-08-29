import type { Settings } from "./types";

/**
 * Which sections the dashboard shows, and in what order.
 *
 * The dashboard answers four questions — how healthy am I, where is the budget
 * heading, what is coming, and what needs attention — but which of those
 * matters most is a matter of how somebody actually uses the app. Someone with
 * no recurring costs has no use for the schedule; someone tracking a single
 * month has no use for the year-to-date figures.
 *
 * Preferences are stored as an ordered list of `{ id, visible }` rather than as
 * a set of booleans, so one field carries both order and visibility and the two
 * can never disagree about which sections exist.
 */

export type DashboardWidgetId =
  | "alerts"
  | "health"
  | "charts"
  | "detail"
  | "budget"
  | "upcoming"
  | "savings";

export interface DashboardWidget {
  id: DashboardWidgetId;
  /** Translation key, not a word. */
  labelKey: string;
  /** What the section actually shows, for the customiser's list. */
  /** Translation keys, not words: this module is a leaf with no translator. */
  descriptionKey: string;
  /**
   * Sections that answer a question nothing else answers. They can be
   * reordered but not hidden: a dashboard with no figures on it is not a
   * simplified dashboard, it is a blank page.
   */
  required?: boolean;
}

/** The default arrangement: alerts, then answers, then reference. */
export const DASHBOARD_WIDGETS: readonly DashboardWidget[] = [
  {
    id: "alerts",
    labelKey: "widget.alerts",
    descriptionKey: "widget.alerts.description",
  },
  {
    id: "health",
    labelKey: "widget.health",
    descriptionKey: "widget.health.description",
    required: true,
  },
  {
    id: "charts",
    labelKey: "widget.charts",
    descriptionKey: "widget.charts.description",
  },
  {
    id: "upcoming",
    labelKey: "widget.upcoming",
    descriptionKey: "widget.upcoming.description",
  },
  {
    id: "budget",
    labelKey: "widget.budget",
    descriptionKey: "widget.budget.description",
  },
  {
    id: "detail",
    labelKey: "widget.detail",
    descriptionKey: "widget.detail.description",
  },
  {
    id: "savings",
    labelKey: "widget.savings",
    descriptionKey: "widget.savings.description",
  },
];

const DEFAULT_ORDER = DASHBOARD_WIDGETS.map((widget) => widget.id);

export interface ResolvedWidget {
  id: DashboardWidgetId;
  visible: boolean;
}

/**
 * The stored arrangement, reconciled against the sections that actually exist.
 *
 * Unknown ids are dropped (a section removed in a later version) and missing
 * ones are appended in their default position (a section added in a later
 * version), so an old stored list never hides something new or resurrects
 * something gone. Required sections are forced visible whatever was stored.
 */
export function dashboardWidgets(settings: Pick<Settings, "dashboard">): ResolvedWidget[] {
  const stored = Array.isArray(settings.dashboard) ? settings.dashboard : [];
  const byId = new Map(stored.map((entry) => [entry.id, entry]));
  const required = new Set(DASHBOARD_WIDGETS.filter((widget) => widget.required).map((widget) => widget.id));

  const known = stored
    .filter((entry) => DEFAULT_ORDER.includes(entry.id as DashboardWidgetId))
    .map((entry) => ({
      id: entry.id as DashboardWidgetId,
      visible: required.has(entry.id as DashboardWidgetId) ? true : entry.visible !== false,
    }));

  // Appended rather than prepended: a section the user has never seen should
  // not push the ones they arranged down the page.
  for (const id of DEFAULT_ORDER) {
    if (!byId.has(id)) known.push({ id, visible: true });
  }
  return known;
}

/** Move one section up or down, clamped at the ends. */
export function moveWidget(
  widgets: ResolvedWidget[],
  id: DashboardWidgetId,
  direction: -1 | 1,
): ResolvedWidget[] {
  const index = widgets.findIndex((widget) => widget.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= widgets.length) return widgets;
  const next = [...widgets];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Toggle a section, refusing to hide one the dashboard cannot do without. */
export function toggleWidget(widgets: ResolvedWidget[], id: DashboardWidgetId): ResolvedWidget[] {
  const definition = DASHBOARD_WIDGETS.find((widget) => widget.id === id);
  if (definition?.required) return widgets;
  return widgets.map((widget) => (widget.id === id ? { ...widget, visible: !widget.visible } : widget));
}

export function widgetDefinition(id: DashboardWidgetId): DashboardWidget {
  // Unreachable for a resolved list: `dashboardWidgets` drops unknown ids.
  return DASHBOARD_WIDGETS.find((widget) => widget.id === id) ?? DASHBOARD_WIDGETS[0];
}
