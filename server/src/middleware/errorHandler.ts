import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    /**
     * Stable machine-readable reason, when the client must branch on *why*
     * rather than merely on the status. `unauthenticated` is the case that
     * matters: the store falls back to its offline cache whenever a request
     * fails, and doing that after a sign-out would render the previous
     * account's budget. Matching on the message text instead would break the
     * moment the wording changes.
     */
    public code?: string,
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
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  // body-parser (express.json) rejects malformed or non-object payloads with an
  // error carrying its own 4xx status. Without this branch those surface as an
  // opaque 500, which hides a client-side mistake behind a server fault.
  const status = (err as { status?: number; statusCode?: number }).status
    ?? (err as { statusCode?: number }).statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({
      error: err.message || "Invalid request payload",
      statusCode: status,
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
