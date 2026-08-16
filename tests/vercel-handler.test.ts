/**
 * Regression tests for the Vercel API entrypoint.
 *
 * These exist because production was returning a platform 404 for every path
 * deeper than one segment. Vercel's zero-config `/api` directory compiles a
 * `[param]` filename to `([^/]+)` and does the same for `[...param]` — the
 * spread form is a Next.js convention with no equivalent here — so the old
 * `api/[...path].ts` was published as a single-segment route and everything
 * below it fell through to Vercel's automatic `/api` 404.
 *
 * Routing is now explicit in vercel.json, and the handler restores the
 * original path from `__vpath` when Vercel delivers the rewrite destination
 * instead of the requested path.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import handler, { restoreOriginalPath } from "../api/index";

describe("Vercel API entrypoint", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer(handler as unknown as Parameters<typeof createServer>[0]);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const get = (path: string) => fetch(`${baseUrl}${path}`);

  /**
   * Without a database these answer 503, which is exactly the point: a 503
   * comes from the Express app, proving the request was routed. A 404 would
   * mean it never arrived.
   */
  it("routes a single-segment path to the app", async () => {
    const res = await get("/api/health");
    expect(res.status).not.toBe(404);
  });

  it("routes a two-segment path to the app", async () => {
    const res = await get("/api/snapshot/revision");
    expect(res.status).not.toBe(404);
  });

  it("routes a three-segment path to the app", async () => {
    // The deepest real route, /api/spending/:year/:month, could never have
    // been reached under the old single-segment filename.
    const res = await get("/api/spending/2026/8");
    expect(res.status).not.toBe(404);
  });

  it("reconstructs a multi-segment path from __vpath", async () => {
    const res = await get("/api?__vpath=snapshot/revision");
    expect(res.status).not.toBe(404);
  });

  it("exports an Express app, not a bare handler", () => {
    // @vercel/node checks `typeof listener.listen === "function"` and skips
    // its request helpers for Express. Those helpers buffer and replay the
    // request body, which must not happen in front of express.json().
    expect(typeof (handler as unknown as { listen?: unknown }).listen).toBe("function");
  });
});

/**
 * The `__vpath` shim, tested directly.
 *
 * Production was measured after this shipped: Vercel delivers the ORIGINAL
 * request path, so the shim is a no-op today and there is no longer a probe
 * route to observe it through. It is kept as a guard — `vercel dev` already
 * routes on the rewrite destination and Vercel has signalled that production
 * may follow — which is exactly why it still needs tests. A silent regression
 * here would only surface as a platform 404 in production.
 */
describe("__vpath path restoration", () => {
  const normalize = (url: string): string => {
    const req = { url } as unknown as Parameters<typeof restoreOriginalPath>[0];
    let called = false;
    restoreOriginalPath(req, {} as never, () => {
      called = true;
    });
    expect(called).toBe(true);
    return req.url;
  };

  it("reconstructs the path when handed the rewrite destination", () => {
    expect(normalize("/api?__vpath=health")).toBe("/api/health");
  });

  it("reconstructs a multi-segment path", () => {
    expect(normalize("/api?__vpath=spending/2026/8")).toBe("/api/spending/2026/8");
  });

  it("keeps the caller's query string and strips __vpath", () => {
    const result = normalize("/api?__vpath=health&foo=bar");
    expect(result).toBe("/api/health?foo=bar");
    // __vpath is internal plumbing and must never reach the application.
    expect(result).not.toContain("__vpath");
  });

  it("leaves an already-correct path untouched", () => {
    expect(normalize("/api/health")).toBe("/api/health");
  });

  it("never double-prefixes /api", () => {
    // A leading slash in __vpath must not become /api//... or /api/api/...
    const result = normalize("/api?__vpath=/health");
    expect(result).toBe("/api/health");
    expect(result).not.toContain("/api/api");
    expect(result).not.toContain("//health");
  });

  it("passes an unrelated path through unchanged", () => {
    expect(normalize("/api/snapshot/revision?x=1")).toBe("/api/snapshot/revision?x=1");
  });
});

describe("database connection string resolution", () => {
  const KEYS = [
    "DATABASE_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_URL_NON_POOLING",
  ];
  let saved: Record<string, string | undefined>;

  beforeAll(async () => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  });

  afterAll(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const clear = () => KEYS.forEach((k) => delete process.env[k]);

  it("reports which known variables are set, and never their values", async () => {
    const { connectionStringSources } = await import("../server/src/db/index");
    clear();
    process.env.POSTGRES_URL = "postgres://secret:hunter2@example.com/db";

    const sources = connectionStringSources();
    expect(sources.find((s) => s.name === "POSTGRES_URL")?.present).toBe(true);
    expect(sources.find((s) => s.name === "DATABASE_URL")?.present).toBe(false);
    // The report must be names and booleans only.
    expect(JSON.stringify(sources)).not.toContain("hunter2");
  });

  it("treats a blank variable as absent", async () => {
    const { connectionStringSources } = await import("../server/src/db/index");
    clear();
    process.env.DATABASE_URL = "   ";
    expect(connectionStringSources().find((s) => s.name === "DATABASE_URL")?.present).toBe(false);
  });

  it("accepts the aliases the Neon and Vercel integrations provision", async () => {
    // A project wired up through the marketplace can end up with POSTGRES_URL
    // and no DATABASE_URL at all; that must still connect.
    const { connectionStringSources } = await import("../server/src/db/index");
    clear();
    process.env.POSTGRES_URL_NON_POOLING = "postgres://example";
    const present = connectionStringSources().filter((s) => s.present).map((s) => s.name);
    expect(present).toEqual(["POSTGRES_URL_NON_POOLING"]);
  });
});
