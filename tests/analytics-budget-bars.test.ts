import { describe, expect, it } from "vitest";
import { monthlyBudgetBarStyle } from "../src/domain/analytics";

describe("monthly budget bar status", () => {
  it("colors past months green below and red above their own budget", () => {
    expect(monthlyBudgetBarStyle(80, 100, false).color).toBe("var(--success)");
    expect(monthlyBudgetBarStyle(120, 100, false).color).toBe("var(--danger)");
  });

  it("marks an exact past month with a green overlay", () => {
    expect(monthlyBudgetBarStyle(100, 100, false)).toMatchObject({ color: "var(--success)", overlayColor: "var(--success-text)", exact: true });
  });

  it("keeps the current month orange with distinct below, above and exact overlays", () => {
    expect(monthlyBudgetBarStyle(80, 100, true)).toMatchObject({ color: "var(--warning)", overlayColor: "var(--success)" });
    expect(monthlyBudgetBarStyle(120, 100, true)).toMatchObject({ color: "var(--warning)", overlayColor: "var(--danger)" });
    expect(monthlyBudgetBarStyle(100, 100, true)).toMatchObject({ color: "var(--warning)", overlayColor: "var(--success-text)", exact: true });
  });

  it("does not score missing, zero or negative budgets", () => {
    expect(monthlyBudgetBarStyle(10, 0, true).color).toBeUndefined();
    expect(monthlyBudgetBarStyle(10, null, false).color).toBeUndefined();
    expect(monthlyBudgetBarStyle(null, 100, false).color).toBeUndefined();
  });
});
