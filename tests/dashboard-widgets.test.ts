/**
 * Which dashboard sections appear, and in what order.
 *
 * The reconciliation is the part worth pinning: a stored list is data from an
 * older version of the app, so it must neither hide a section that did not
 * exist when it was written nor resurrect one that has since been removed.
 */

import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGETS,
  dashboardWidgets,
  moveWidget,
  toggleWidget,
  widgetDefinition,
  type DashboardWidgetId,
} from "../src/domain/dashboard";

const ALL = DASHBOARD_WIDGETS.map((widget) => widget.id);

describe("dashboardWidgets", () => {
  it("shows everything, in the default order, when nothing has been chosen", () => {
    const resolved = dashboardWidgets({});
    expect(resolved.map((w) => w.id)).toEqual(ALL);
    expect(resolved.every((w) => w.visible)).toBe(true);
  });

  it("honours a stored order and stored visibility", () => {
    const resolved = dashboardWidgets({
      dashboard: [
        { id: "upcoming", visible: true },
        { id: "health", visible: true },
        { id: "charts", visible: false },
        { id: "alerts", visible: true },
        { id: "budget", visible: true },
        { id: "detail", visible: true },
        { id: "savings", visible: true },
      ],
    });
    expect(resolved[0].id).toBe("upcoming");
    expect(resolved.find((w) => w.id === "charts")?.visible).toBe(false);
  });

  it("appends a section the stored list has never heard of", () => {
    // A section added in a later version must appear for someone who saved an
    // arrangement before it existed, not be silently missing forever.
    const resolved = dashboardWidgets({ dashboard: [{ id: "health", visible: true }] });
    expect(resolved.map((w) => w.id)).toContain("upcoming");
    expect(resolved).toHaveLength(ALL.length);
    // Appended, not prepended: it must not push the arranged ones down.
    expect(resolved[0].id).toBe("health");
  });

  it("drops a section that no longer exists", () => {
    const resolved = dashboardWidgets({
      dashboard: [{ id: "a-section-we-removed", visible: true }, { id: "health", visible: true }],
    });
    expect(resolved.map((w) => w.id)).not.toContain("a-section-we-removed");
    expect(resolved).toHaveLength(ALL.length);
  });

  it("refuses to hide a section the dashboard cannot do without", () => {
    const stored = ALL.map((id) => ({ id, visible: false }));
    const resolved = dashboardWidgets({ dashboard: stored });
    for (const widget of resolved) {
      if (widgetDefinition(widget.id).required) expect(widget.visible).toBe(true);
    }
    // And it cannot be turned off through the toggle either.
    const required = DASHBOARD_WIDGETS.find((w) => w.required)!.id;
    const after = toggleWidget(dashboardWidgets({}), required);
    expect(after.find((w) => w.id === required)?.visible).toBe(true);
  });
});

describe("reordering", () => {
  it("moves a section up and down", () => {
    const start = dashboardWidgets({});
    const second = start[1].id;
    expect(moveWidget(start, second, -1)[0].id).toBe(second);
    expect(moveWidget(start, second, 1)[2].id).toBe(second);
  });

  it("clamps at the ends rather than wrapping around", () => {
    const start = dashboardWidgets({});
    expect(moveWidget(start, start[0].id, -1)).toEqual(start);
    expect(moveWidget(start, start[start.length - 1].id, 1)).toEqual(start);
  });

  it("ignores a section that is not in the list", () => {
    const start = dashboardWidgets({});
    expect(moveWidget(start, "nonsense" as DashboardWidgetId, 1)).toEqual(start);
  });

  it("never loses or duplicates a section", () => {
    let list = dashboardWidgets({});
    for (const direction of [-1, 1, 1, -1, 1] as const) {
      list = moveWidget(list, list[2].id, direction);
    }
    expect(new Set(list.map((w) => w.id)).size).toBe(ALL.length);
  });
});

describe("toggling", () => {
  it("hides and shows an optional section", () => {
    const start = dashboardWidgets({});
    const hidden = toggleWidget(start, "savings");
    expect(hidden.find((w) => w.id === "savings")?.visible).toBe(false);
    expect(toggleWidget(hidden, "savings").find((w) => w.id === "savings")?.visible).toBe(true);
  });
});
