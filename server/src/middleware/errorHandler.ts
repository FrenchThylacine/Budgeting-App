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
