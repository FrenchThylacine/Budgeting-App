/**
 * End-to-end API integration tests.
 *
 * Boots the real Express application and drives it over HTTP so the full
 * production path is exercised: route → validation → BudgetService →
 * SnapshotRepository → PostgreSQL → back out as JSON.
 *
 * The database module is substituted with a node-postgres adapter that
 * presents the same interface as the Neon serverless driver (tagged template
 * plus `.transaction([...])`), because the Neon driver speaks HTTP to Neon's
 * endpoint and cannot target a local server. Everything above the driver is
 * the real production code.
 *
 * Skipped unless TEST_DATABASE_URL is set:
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget_test npm test
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDatabase } from "../server/src/db/index";
import { Client } from "pg";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const connectionString = process.env.TEST_DATABASE_URL;
const describeApi = connectionString ? describe : describe.skip;

const client = new Client({ connectionString: connectionString ?? "" });

function pgTagAdapter(pgClient: Client) {
  const sql: any = (strings: TemplateStringsArray, ...params: unknown[]) => {
    let text = "";
    strings.forEach((part, i) => {
      text += part;
      if (i < params.length) text += `$${i + 1}`;
    });
    return {
      __query: { text, values: params },
      then(resolve: any, reject: any) {
        return pgClient.query(text, params).then((r) => r.rows).then(resolve, reject);
      },
    };
  };
  sql.transaction = async (queries: any[]) => {
    await pgClient.query("BEGIN");
    try {
      const out = [];
      for (const q of queries) out.push((await pgClient.query(q.__query.text, q.__query.values)).rows);
      await pgClient.query("COMMIT");
      return out;
    } catch (error) {
      await pgClient.query("ROLLBACK");
      throw error;
    }
  };
  return sql;
}

describeApi("API integration over HTTP", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await client.connect();
    // Private schema keeps this suite isolated from the repository suite when
    // Vitest runs both files in parallel against the same database.
    await client.query(`DROP SCHEMA IF EXISTS test_api CASCADE;`);
    await client.query(`CREATE SCHEMA test_api;`);
    await client.query(`SET search_path TO test_api;`);

    // Swap only the driver; every route, service, and repository stays real.
    setDatabase(pgTagAdapter(client));

    const { createApp } = await import("../server/src/app");
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    setDatabase(null);
    await client.end();
  });

  async function api(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  }

  async function putSnapshot(snapshot: unknown) {
    return api("/api/snapshot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  }

  it("reports healthy", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("returns 404 before any snapshot is stored", async () => {
    const res = await api("/api/snapshot");
    expect(res.status).toBe(404);
  });

  it("rejects a malformed snapshot payload with 400, not 500", async () => {
    expect((await putSnapshot("not-an-object")).status).toBe(400);
    expect((await putSnapshot(null)).status).toBe(400);
    expect((await putSnapshot([1, 2, 3])).status).toBe(400);

    // Raw broken JSON must also be a client error.
    const broken = await api("/api/snapshot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(broken.status).toBe(400);
  });

  it("rejects structurally incomplete snapshots that would corrupt stored data", async () => {
    expect((await putSnapshot({ version: 1 })).status).toBe(400);
    expect((await putSnapshot({ version: 1, settings: {}, categories: "nope", years: {} })).status).toBe(400);
    expect((await putSnapshot({ version: 1, settings: {}, categories: [], years: [] })).status).toBe(400);
    expect(
      (await putSnapshot({ version: 1, settings: {}, categories: [], years: {}, revision: "abc" })).status,
    ).toBe(400);
  });

  it("stores a snapshot and reads it back through the API", async () => {
    const { createSeedBudgetSnapshot } = await import("../src/data/seedBudget");
    const snapshot = createSeedBudgetSnapshot();
    snapshot.revision = 1;

    const put = await putSnapshot(snapshot);
    expect(put.status).toBe(200);
    expect(put.body.success).toBe(true);

    const get = await api("/api/snapshot");
    expect(get.status).toBe(200);
    expect(get.body.revision).toBe(1);
    expect(get.body.categories.length).toBe(snapshot.categories.length);
  });

  it("persists a new spending entry and returns it on reload", async () => {
    const current = (await api("/api/snapshot")).body;
    const yearKey = Object.keys(current.years)[0];
    current.years[yearKey].spendingEntries.push({
      id: "api-spend-1",
      year: Number(yearKey),
      month: 8,
      week: 33,
      date: `${yearKey}-08-15`,
      categoryId: current.categories[0].id,
      amount: 42.5,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "via API",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    current.revision = 2;

    expect((await putSnapshot(current)).status).toBe(200);

    const reloaded = (await api("/api/snapshot")).body;
    const entry = reloaded.years[yearKey].spendingEntries.find((e: any) => e.id === "api-spend-1");
    expect(entry).toBeDefined();
    expect(entry.amount).toBe(42.5);
    expect(entry.year).toBe(Number(yearKey));
  });

  it("assigns the revision server-side rather than trusting the client", async () => {
    const snapshot = (await api("/api/snapshot")).body;
    const before = snapshot.revision;

    // A client claiming an absurd revision must not be able to set it.
    snapshot.revision = 9999;
    const res = await putSnapshot({ ...snapshot, baseRevision: before });
    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(before + 1);

    const stored = (await api("/api/snapshot")).body;
    expect(stored.revision).toBe(before + 1);
  });

  it("rejects a write built on a stale base even when its own revision is higher", async () => {
    // This is the offline-device case: it kept incrementing its counter while
    // disconnected, so its revision outruns the server's even though its data
    // is older. Trusting that number would erase the other device's work.
    const current = (await api("/api/snapshot")).body;
    const serverRevision = current.revision;

    const staleDevice = {
      ...current,
      revision: serverRevision + 50,
      baseRevision: serverRevision - 1,
    };

    const res = await putSnapshot(staleDevice);
    expect(res.status).toBe(409);
    expect(res.body.revision).toBe(serverRevision);
    expect(res.body.snapshot).toBeTruthy();

    const after = (await api("/api/snapshot")).body;
    expect(after.revision).toBe(serverRevision);
  });

  it("accepts a write whose base matches, then rejects a second write reusing that base", async () => {
    const shared = (await api("/api/snapshot")).body;
    const base = shared.revision;

    // Two devices both read revision `base` and both edit.
    const deviceA = { ...structuredClone(shared), baseRevision: base };
    const deviceB = { ...structuredClone(shared), baseRevision: base };

    const first = await putSnapshot(deviceA);
    expect(first.status).toBe(200);

    // The second device's base is now stale — it must not silently win.
    const second = await putSnapshot(deviceB);
    expect(second.status).toBe(409);
    expect(second.body.snapshot.revision).toBe(base + 1);
  });

  it("lets the loser of a conflict succeed after adopting the server revision", async () => {
    const server = (await api("/api/snapshot")).body;
    const rebased = { ...server, baseRevision: server.revision };
    const res = await putSnapshot(rebased);
    expect(res.status).toBe(200);
    expect(res.body.revision).toBe(server.revision + 1);
  });

  it("exposes a cheap revision probe for freshness checks", async () => {
    const full = (await api("/api/snapshot")).body;
    const probe = await api("/api/snapshot/revision");
    expect(probe.status).toBe(200);
    expect(probe.body.revision).toBe(full.revision);
  });

  it("rejects a legacy client whose revision is not newer than the stored one", async () => {
    // Clients that predate baseRevision still get the monotonic guard rather
    // than being allowed to clobber.
    const stored = (await api("/api/snapshot")).body;
    const stale = { ...stored, revision: stored.revision - 1 };
    delete (stale as Record<string, unknown>).baseRevision;

    const conflict = await putSnapshot(stale);
    expect(conflict.status).toBe(409);
    expect(conflict.body.snapshot).toBeTruthy();
    expect(conflict.body.revision).toBe(stored.revision);

    const after = (await api("/api/snapshot")).body;
    expect(after.revision).toBe(stored.revision);
  });

  it("propagates a second device's edit to the first device", async () => {
    const deviceB = (await api("/api/snapshot")).body;
    const yearKey = Object.keys(deviceB.years)[0];
    const entry = deviceB.years[yearKey].spendingEntries.find((e: any) => e.id === "api-spend-1");
    entry.amount = 77.25;
    entry.note = "edited on device B";

    const write = await putSnapshot({ ...deviceB, baseRevision: deviceB.revision });
    expect(write.status).toBe(200);

    // Device A reloads and sees device B's edit.
    const deviceA = (await api("/api/snapshot")).body;
    const seen = deviceA.years[yearKey].spendingEntries.find((e: any) => e.id === "api-spend-1");
    expect(seen.amount).toBe(77.25);
    expect(seen.note).toBe("edited on device B");
    expect(deviceA.revision).toBe(write.body.revision);
  });

  it("patches settings and bumps the revision", async () => {
    const before = (await api("/api/snapshot")).body;
    const res = await api("/api/snapshot/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyBudget: 1234 }),
    });
    expect(res.status).toBe(200);
    expect(res.body.monthlyBudget).toBe(1234);

    const after = (await api("/api/snapshot")).body;
    expect(after.settings.monthlyBudget).toBe(1234);
    expect(after.revision).toBe((before.revision ?? 0) + 1);
  });

  it("keeps a zero amount as zero across the API round trip", async () => {
    const snapshot = (await api("/api/snapshot")).body;
    const yearKey = Object.keys(snapshot.years)[0];
    snapshot.years[yearKey].spendingEntries.push({
      id: "api-spend-zero",
      year: Number(yearKey),
      month: 8,
      week: 33,
      date: `${yearKey}-08-16`,
      categoryId: snapshot.categories[0].id,
      amount: 0,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "zero",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    expect((await putSnapshot(snapshot)).status).toBe(200);

    const after = (await api("/api/snapshot")).body;
    const zero = after.years[yearKey].spendingEntries.find((e: any) => e.id === "api-spend-zero");
    expect(zero).toBeDefined();
    expect(zero.amount).toBe(0);
  });
});
