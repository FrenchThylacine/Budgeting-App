import express from "express";
import type { NextFunction, Request, Response } from "express";

/**
 * Vercel entrypoint for the whole Express API.
 *
 * This file lazily imports the real server app on the first request so that any
 * import-time failures (database drivers, environment misconfiguration, etc.)
 * can be caught and returned as a JSON error rather than causing
 * FUNCTION_INVOCATION_FAILED with an opaque plain-text response.
 */

/** Paths the rewrite can land on, i.e. the destination rather than the request. */
const REWRITE_DESTINATIONS = new Set(["/api", "/api/", "/api/index"]);

/**
 * Rebuild the original request path when Vercel hands us the rewrite
 * destination instead of the path the browser asked for.
 */
export function restoreOriginalPath(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.url ?? "/";
  const queryStart = raw.indexOf("?");
  const pathname = queryStart === -1 ? raw : raw.slice(0, queryStart);
  const params = new URLSearchParams(queryStart === -1 ? "" : raw.slice(queryStart + 1));

  const vpath = params.get("__vpath");
  if (vpath === null) {
    next();
    return;
  }

  // `__vpath` is ours; the application must never see it.
  params.delete("__vpath");
  const search = params.toString();
  const pathToUse = REWRITE_DESTINATIONS.has(pathname)
    ? `/api/${vpath.replace(/^\/+/, "")}`
    : pathname;

  req.url = search ? `${pathToUse}?${search}` : pathToUse;
  req.originalUrl = req.url;
  next();
}

const handler = express();
handler.use(restoreOriginalPath);

// Lazy-mount the real app. If the module import fails at runtime (for example
// because database initialization throws), respond with a clear JSON error so
// Vercel does not surface a generic FUNCTION_INVOCATION_FAILED page.
let mounted = false;
let mountError: Error | null = null;

handler.use((req, res, next) => {
  if (mounted) return next();
  if (mountError) {
    res.status(500).json({ error: "Server startup failure", message: mountError.message });
    return;
  }

  // Dynamic import so failures are catchable at request time.
  import("../server/src/app.js")
    .then((mod) => {
      handler.use(mod.app);
      mounted = true;
      next();
    })
    .catch((err) => {
      mountError = err instanceof Error ? err : new Error(String(err));
      // Log the full error on the function so you can read it in Vercel's logs.
      console.error("[api/index] failed to import app:", mountError);
      res.status(500).json({ error: "Server startup failure", message: mountError.message });
    });
});

export default handler;
