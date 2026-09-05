import type { NextFunction, Request, Response } from "express";
import { AuthRepository } from "./AuthRepository.js";
import { readSessionToken } from "./cookies.js";
import { hashToken } from "./tokens.js";
import { AppError } from "../middleware/errorHandler.js";

/** What an authenticated request carries. */
export interface AuthContext {
  userId: string;
  email: string;
  username: string | null;
  /** The budget this account owns; every repository call is scoped to it. */
  snapshotId: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * Resolve the session cookie, if there is one, without requiring it.
 *
 * Split from `requireAuth` so public endpoints can still know who is calling —
 * `/api/auth/me` needs to answer "nobody" with a 200 rather than a 401.
 */
export async function attachAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readSessionToken(req);
    if (!token) {
      next();
      return;
    }
    const repo = new AuthRepository();
    const session = await repo.findSessionByTokenHash(hashToken(token));
    if (session) {
      req.auth = {
        userId: session.userId,
        email: session.email,
        username: session.username,
        snapshotId: session.snapshotId,
        sessionId: session.id,
      };
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Refuse the request unless it carries a valid session.
 *
 * The 401 body includes a stable `code` so the client can tell "you are signed
 * out" apart from every other failure. That distinction is load-bearing: the
 * store falls back to its IndexedDB cache when a request fails, and doing that
 * after a sign-out would render the previous account's budget.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new AppError(401, "Authentication required.", "unauthenticated"));
    return;
  }
  next();
}

/** The budget id for this request. */
export function snapshotIdFor(req: Request): string {
  const snapshotId = req.auth?.snapshotId;
  if (!snapshotId) {
    // Reachable only if a route is mounted before requireAuth. Failing loudly
    // beats silently serving or overwriting the shared "active" budget.
    throw new AppError(401, "Authentication required.", "unauthenticated");
  }
  return snapshotId;
}
