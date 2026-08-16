import express from "express";
import type { NextFunction, Request, Response } from "express";
import { app } from "../server/src/app.js";

/**
 * Vercel entrypoint for the whole Express API.
 *
 * ## Why this file is not `[...path].ts`
 *
 * The zero-config `/api` directory only understands SINGLE-segment dynamic
 * filenames. Vercel compiles `[param]` to the regex `([^/]+)`, and it does the
 * same for `[...param]` — the spread form is a Next.js convention with no
 * equivalent here. So `api/[...path].ts` was published as `^/api/([^/]+)$`,
 * and Vercel then appends its own `{ src: '^/api(/.*)?$', status: 404 }` for
 * everything under `/api` that no function matched.
 *
 * That is exactly what production showed: `/api/health` reached the function
 * while `/api/snapshot/revision` returned a platform 404. The deepest real
 * route, `/api/spending/:year/:month`, could never have been reached at all.
 *
 * Routing therefore has to be explicit, and lives in `vercel.json`.
 *
 * ## Why the import carries a `.js` extension
 *
 * `@vercel/node` does not bundle: it traces the file graph and transpiles each
 * `.ts` in place. With `"type": "module"` the emitted `import "../server/src/app"`
 * is unresolvable at runtime (`ERR_MODULE_NOT_FOUND`), which surfaced as
 * `FUNCTION_INVOCATION_FAILED`. A `.js` specifier is mapped back onto the `.ts`
 * source, which is why every other server file already works.
 *
 * ## Why the default export stays an Express app
 *
 * `@vercel/node` checks `typeof listener.listen === "function"` and skips its
 * request helpers for Express. Those helpers eagerly buffer and replay the
 * request body, which must not happen in front of `express.json()`. Wrapping
 * the app in a plain `(req, res)` function would silently re-enable that, so
 * the wrapper is itself an Express app.
 */

/** Paths the rewrite can land on, i.e. the destination rather than the request. */
const REWRITE_DESTINATIONS = new Set(["/api", "/api/", "/api/index"]);

/**
 * Rebuild the original request path when Vercel hands us the rewrite
 * destination instead of the path the browser asked for.
 *
 * Measured in production: Vercel delivers the ORIGINAL path, so this is
 * currently a no-op. It is kept because Vercel has announced that internal
 * rewrites may start routing on the rewritten destination path, and
 * `vercel dev` already behaves that way. The sub-path travels in `__vpath`, so
 * the correct URL can be reconstructed under either behaviour without ever
 * double-prefixing `/api`.
 */
function restoreOriginalPath(req: Request, _res: Response, next: NextFunction): void {
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
handler.use(app);

export default handler;
