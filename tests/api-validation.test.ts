import { describe, it, expect } from "vitest";
import { validateFiniteNumber, validateDateInput, validateEnum, validateRequired, AppError } from "../server/src/middleware/errorHandler";
import { validateSettingsPatch } from "../server/src/routes/snapshot";

describe("API validation middleware helpers", () => {
  it("validates required fields and throws AppError if missing", () => {
    expect(() => validateRequired({ name: "Food" }, "name")).not.toThrow();
    expect(() => validateRequired({ name: "" }, "name")).toThrow(AppError);
    expect(() => validateRequired({ name: null }, "name")).toThrow(AppError);
    expect(() => validateRequired({}, "amount")).toThrow(AppError);
  });

  it("validates finite numbers and enforces integer/min options", () => {
    expect(validateFiniteNumber(100, "amount")).toBe(100);
    expect(validateFiniteNumber("50.5", "amount")).toBe(50.5);
    expect(validateFiniteNumber(0, "amount", { min: 0 })).toBe(0);

    expect(() => validateFiniteNumber("abc", "amount")).toThrow(AppError);
    expect(() => validateFiniteNumber(NaN, "amount")).toThrow(AppError);
    expect(() => validateFiniteNumber(Infinity, "amount")).toThrow(AppError);
    expect(() => validateFiniteNumber(-5, "amount", { min: 0 })).toThrow(AppError);
    expect(() => validateFiniteNumber(3.14, "year", { integer: true })).toThrow(AppError);
  });

  it("validates YYYY-MM-DD date strings", () => {
    expect(validateDateInput("2026-08-10", "date")).toBe("2026-08-10");
    expect(() => validateDateInput("2026-13-01", "date")).toThrow(AppError);
    expect(() => validateDateInput("invalid-date", "date")).toThrow(AppError);
    expect(() => validateDateInput("2026-02-30", "date")).toThrow(AppError);
  });

  it("validates enum values against allowed list", () => {
    const currencies = ["EUR", "USD", "LBP"] as const;
    expect(validateEnum("EUR", "currency", currencies)).toBe("EUR");
    expect(() => validateEnum("INVALID", "currency", currencies)).toThrow(AppError);
  });
});

describe("PATCH /api/snapshot/settings payload validation", () => {
  it("accepts a well-formed patch and returns only the recognised fields", () => {
    expect(validateSettingsPatch({ monthlyBudget: 1200, baseCurrency: "USD", darkMode: true })).toEqual({
      monthlyBudget: 1200,
      baseCurrency: "USD",
      darkMode: true,
    });
  });

  it("keeps 0 as a real budget", () => {
    // Rule 1: 0 is a value, not a missing field.
    expect(validateSettingsPatch({ monthlyBudget: 0 })).toEqual({ monthlyBudget: 0 });
  });

  it("refuses a value of the wrong type rather than storing it", () => {
    // Each of these was previously written straight into the stored settings.
    expect(() => validateSettingsPatch({ baseCurrency: {} })).toThrow(AppError);
    expect(() => validateSettingsPatch({ baseCurrency: "XYZ" })).toThrow(AppError);
    expect(() => validateSettingsPatch({ monthlyBudget: "lots" })).toThrow(AppError);
    expect(() => validateSettingsPatch({ monthlyBudget: Number.NaN })).toThrow(AppError);
    expect(() => validateSettingsPatch({ darkMode: "yes" })).toThrow(AppError);
    expect(() => validateSettingsPatch({ selectedMonth: 13 })).toThrow(AppError);
    expect(() => validateSettingsPatch({ selectedMonth: 1.5 })).toThrow(AppError);
    expect(() => validateSettingsPatch({ selectedPeriodMode: "decade" })).toThrow(AppError);
    expect(() => validateSettingsPatch({ exchangeRates: "1.19" })).toThrow(AppError);
  });


  it("accepts the preferences added for the interface, and only their legal values", () => {
    // Every one of these decides how the whole application looks or reads, and
    // an unrecognised value stored here would be synced to every device.
    expect(validateSettingsPatch({ themePreset: "plum" })).toEqual({ themePreset: "plum" });
    expect(validateSettingsPatch({ appearance: "system" })).toEqual({ appearance: "system" });
    expect(validateSettingsPatch({ aircraft: "a350" })).toEqual({ aircraft: "a350" });
    expect(validateSettingsPatch({ secondaryCurrency: "CHF" })).toEqual({ secondaryCurrency: "CHF" });

    for (const bad of [
      { themePreset: "hot-pink" },
      { appearance: "sepia" },
      { aircraft: "spitfire" },
      { secondaryCurrency: "XXXX" },
    ]) {
      expect(() => validateSettingsPatch(bad), JSON.stringify(bad)).toThrow();
    }
  });

  it("lets null clear the second currency, which is a legal thing to want", () => {
    expect(validateSettingsPatch({ secondaryCurrency: null })).toEqual({ secondaryCurrency: null });
  });

  it("refuses a field it does not recognise instead of storing it forever", () => {
    expect(() => validateSettingsPatch({ somethingNobodyDefined: 1 })).toThrow(AppError);
  });

  it("ignores a client-supplied lastUpdated, which the server stamps", () => {
    expect(validateSettingsPatch({ darkMode: false, lastUpdated: "1999-01-01T00:00:00Z" })).toEqual({
      darkMode: false,
    });
  });

  it("refuses an empty or non-object payload", () => {
    expect(() => validateSettingsPatch({})).toThrow(AppError);
    expect(() => validateSettingsPatch({ lastUpdated: "2026-01-01T00:00:00Z" })).toThrow(AppError);
    expect(() => validateSettingsPatch(null)).toThrow(AppError);
    expect(() => validateSettingsPatch([1, 2])).toThrow(AppError);
    expect(() => validateSettingsPatch("darkMode=true")).toThrow(AppError);
  });
});
