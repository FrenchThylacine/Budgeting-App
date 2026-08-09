import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode,
    });
    return;
  }

  console.error("Unexpected error:", err);
  res.status(500).json({
    error: "Internal server error",
    statusCode: 500,
  });
}

export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function validateRequired(obj: any, ...fields: string[]): void {
  for (const field of fields) {
    if (obj[field] == null || obj[field] === "") {
      throw new AppError(400, `Missing required field: ${field}`);
    }
  }
}

export function validateFiniteNumber(value: unknown, field: string, options: { min?: number; integer?: boolean } = {}): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) throw new AppError(400, `Invalid numeric field: ${field}`);
  if (options.integer && !Number.isInteger(parsed)) throw new AppError(400, `Field must be an integer: ${field}`);
  if (options.min !== undefined && parsed < options.min) throw new AppError(400, `Field must be at least ${options.min}: ${field}`);
  return parsed;
}

export function validateDateInput(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `Invalid date field: ${field}`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new AppError(400, `Invalid date field: ${field}`);
  }
  return value;
}

export function validateEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AppError(400, `Invalid field: ${field}`);
  }
  return value as T;
}
