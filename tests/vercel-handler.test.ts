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
import handler from "../api/index";

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

  it("reconstructs the path when handed the rewrite destination", async () => {
    const res = await get("/api?__vpath=__routecheck");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.normalizedUrl).toBe("/api/__routecheck");
  });

  it("reconstructs a multi-segment path from __vpath", async () => {
    const res = await get("/api?__vpath=snapshot/revision");
    expect(res.status).not.toBe(404);
  });

  it("keeps the caller's query string and strips __vpath", async () => {
    const res = await get("/api?__vpath=__routecheck&foo=bar");
    const body = await res.json();
    expect(body.normalizedUrl).toBe("/api/__routecheck?foo=bar");
    // __vpath is internal plumbing and must never reach the application.
    expect(body.normalizedUrl).not.toContain("__vpath");
  });

  it("leaves an already-correct path untouched", async () => {
    const res = await get("/api/__routecheck");
    const body = await res.json();
    expect(body.normalizedUrl).toBe("/api/__routecheck");
  });

  it("never double-prefixes /api", async () => {
    const res = await get("/api?__vpath=/__routecheck");
    const body = await res.json();
    expect(body.normalizedUrl).toBe("/api/__routecheck");
    expect(body.normalizedUrl).not.toContain("/api/api");
  });

  it("exports an Express app, not a bare handler", () => {
    // @vercel/node checks `typeof listener.listen === "function"` and skips
    // its request helpers for Express. Those helpers buffer and replay the
    // request body, which must not happen in front of express.json().
    expect(typeof (handler as unknown as { listen?: unknown }).listen).toBe("function");
  });
});
