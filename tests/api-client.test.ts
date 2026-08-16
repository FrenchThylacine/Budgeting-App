/**
 * BudgetApiClient, with the network stubbed.
 *
 * This file exists because the client had no tests at all, and the gap was not
 * theoretical: a refactor turned the single fetch wrapper into a call to
 * itself, so every request recursed until the stack overflowed. The whole suite
 * stayed green — the API integration tests drive the Express app over HTTP and
 * never touch this class — and the failure surfaced only as "Offline" in a
 * browser, because the overflow was caught and reported as an unreachable API.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiUnavailableError,
  AuthRequiredError,
  BudgetApiClient,
  SnapshotConflictError,
} from "../src/api/client";

const originalFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BudgetApiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const client = () => new BudgetApiClient("/api");

  it("issues exactly one network call per request", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { version: 1 }));
    await client().loadSnapshot();
    // The regression: the wrapper called itself, so this recursed until the
    // stack overflowed. One request must mean one call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends credentials, or the session cookie never travels", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { version: 1 }));
    await client().loadSnapshot();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("sends credentials on writes too", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { revision: 4 }));
    await client().saveSnapshot({ version: 1 } as never, 3);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ credentials: "include", method: "PUT" });
    // The compare-and-swap base must survive the wrapper.
    expect((init as RequestInit).headers).toMatchObject({ "x-base-revision": "3" });
  });

  it("reports a 401 as an authentication failure, not as being offline", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Authentication required." }));
    // The distinction decides whether the store falls back to its offline
    // cache — which, after a sign-out, holds the previous account's budget.
    await expect(client().loadSnapshot()).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("reports a 401 on save as an authentication failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Authentication required." }));
    await expect(client().saveSnapshot({ version: 1 } as never, 1)).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
  });

  it("does not turn a 401 into an empty result", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Authentication required." }));
    // An empty list rendered as real data is indistinguishable from "this
    // account has nothing".
    await expect(client().getSpendingEntries(2026, 8)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it("still reports a genuine transport failure as unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(client().loadSnapshot()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("treats a 5xx as unavailable rather than as a rejected write", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, { error: "Database unavailable" }));
    await expect(client().loadSnapshot()).rejects.toBeInstanceOf(ApiUnavailableError);
  });

  it("returns null, not an error, when no snapshot exists yet", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: "No active snapshot found" }));
    // A new account has no budget. That is a normal state, not a fault.
    await expect(client().loadSnapshot()).resolves.toBeNull();
  });

  it("surfaces a conflict with the server's copy so it can be adopted", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { revision: 12, snapshot: { version: 1, revision: 12 } }),
    );
    const error = await client()
      .saveSnapshot({ version: 1 } as never, 7)
      .catch((e) => e);
    expect(error).toBeInstanceOf(SnapshotConflictError);
    expect((error as SnapshotConflictError).serverRevision).toBe(12);
    expect((error as SnapshotConflictError).serverSnapshot).not.toBeNull();
  });

  it("returns the revision the server assigned, not the one it was sent", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true, revision: 9 }));
    await expect(client().saveSnapshot({ version: 1 } as never, 8)).resolves.toBe(9);
  });
});
