import { describe, expect, it } from "vitest";
import { monthlyBudgetBarStyle } from "../src/domain/analytics";

describe("monthly budget bar status", () => {
  it("colors past months green below and red above their own budget", () => {
    expect(monthlyBudgetBarStyle(80, 100, false).color).toBe("var(--success)");
    expect(monthlyBudgetBarStyle(120, 100, false).color).toBe("var(--danger)");
  });

  it("marks an exact past month gold", () => {
    expect(monthlyBudgetBarStyle(100, 100, false)).toMatchObject({ color: "var(--budget-exact)", exact: true, overlayPattern: false });
  });

  it("keeps current status color with orange progress hatching", () => {
    expect(monthlyBudgetBarStyle(80, 100, true)).toMatchObject({ color: "var(--success)", overlayPattern: true });
    expect(monthlyBudgetBarStyle(120, 100, true)).toMatchObject({ color: "var(--danger)", overlayPattern: true });
    expect(monthlyBudgetBarStyle(100, 100, true)).toMatchObject({ color: "var(--budget-exact)", overlayPattern: true, exact: true });
  });

  it("does not score missing, zero or negative budgets", () => {
    expect(monthlyBudgetBarStyle(10, 0, true).color).toBeUndefined();
    expect(monthlyBudgetBarStyle(10, null, false).color).toBeUndefined();
    expect(monthlyBudgetBarStyle(null, 100, false).color).toBeUndefined();
  });
});
