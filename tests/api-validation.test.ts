import { describe, it, expect } from "vitest";
import { validateFiniteNumber, validateDateInput, validateEnum, validateRequired, AppError } from "../server/src/middleware/errorHandler";

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
