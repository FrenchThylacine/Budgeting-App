/**
 * Authentication, over HTTP, against a real PostgreSQL server.
 *
 * These assert security properties, not features. Each one corresponds to a way
 * the app could leak or destroy someone's financial data, and every one of them
 * would pass silently if it were only checked by hand once.
 *
 * Skipped unless TEST_DATABASE_URL is set.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { setDatabase } from "../server/src/db/index";

const connectionString = process.env.TEST_DATABASE_URL;
const describeAuth = connectionString ? describe : describe.skip;

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

/** One browser: an independent cookie jar over the shared server. */
function createClient(baseUrl: () => string) {
  const cookies = new Map<string, string>();

  function store(response: Response): void {
    const raw = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "") cookies.delete(name);
      else cookies.set(name, value);
    }
  }

  return {
    cookies,
    async request(path: string, init?: RequestInit) {
      const headers: Record<string, string> = {};
      if (cookies.size > 0) {
        headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      }
      Object.assign(headers, (init?.headers ?? {}) as Record<string, string>);
      const response = await fetch(`${baseUrl()}${path}`, { ...init, headers });
      store(response);
      const text = await response.text();
      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      return { status: response.status, body };
    },
    post(path: string, payload: unknown) {
      return this.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  };
}

const PASSWORD = "a-long-enough-passphrase";

describeAuth("authentication", () => {
  let server: Server;
  let url = "";
  const baseUrl = () => url;

  beforeAll(async () => {
    // Keep hashing cheap so the suite stays fast; the code path is identical.
    process.env.PASSWORD_SCRYPT_COST = "10";
    delete process.env.SIGNUP_INVITE_CODE;

    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS test_auth CASCADE;`);
    await client.query(`CREATE SCHEMA test_auth;`);
    await client.query(`SET search_path TO test_auth;`);
    setDatabase(pgTagAdapter(client));

    const { createApp } = await import("../server/src/app");
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    setDatabase(null);
    await client.end();
    delete process.env.PASSWORD_SCRYPT_COST;
  });

  // ─── The guard itself ─────────────────────────────────────────────────────

  it("refuses budget routes without a session", async () => {
    const anon = createClient(baseUrl);
    for (const path of ["/api/snapshot", "/api/snapshot/revision", "/api/categories", "/api/activities"]) {
      const res = await anon.request(path);
      expect(res.status, `${path} must be guarded`).toBe(401);
      // The client branches on this to avoid serving the previous account's
      // budget out of its offline cache.
      expect(res.body.code).toBe("unauthenticated");
    }
  });

  it("leaves health reachable so a signed-out operator can still diagnose", async () => {
    const anon = createClient(baseUrl);
    const res = await anon.request("/api/health");
    expect(res.status).toBe(200);
  });

  it("reports nobody rather than failing when signed out", async () => {
    const anon = createClient(baseUrl);
    const res = await anon.request("/api/auth/me");
    // 200 with user: null, not 401 — this is how the app picks a screen on
    // load, and a 401 would be indistinguishable from an expired session.
    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  // ─── Sign up and sign in ──────────────────────────────────────────────────

  it("creates an account and returns a session", async () => {
    const alice = createClient(baseUrl);
    const res = await alice.post("/api/auth/signup", { email: "alice@example.test", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe("alice@example.test");
    // The hash must never cross the wire in any form.
    expect(JSON.stringify(res.body)).not.toContain("scrypt");
    expect(alice.cookies.has("budget_session")).toBe(true);

    const me = await alice.request("/api/auth/me");
    expect(me.body.user.email).toBe("alice@example.test");
  });

  it("stores the password hashed, never in clear", async () => {
    const rows = await client.query(`SELECT password_hash FROM users WHERE email_normalized = $1`, [
      "alice@example.test",
    ]);
    const hash = rows.rows[0].password_hash as string;
    expect(hash).not.toContain(PASSWORD);
    expect(hash.startsWith("scrypt$")).toBe(true);
  });

  it("refuses a duplicate email, case-insensitively", async () => {
    const other = createClient(baseUrl);
    // Alice@ and alice@ are one mailbox; two accounts would be two budgets for
    // one person, each invisible from the other.
    const res = await other.post("/api/auth/signup", { email: "ALICE@example.test", password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_taken");
  });

  it("rejects a password that is too short", async () => {
    const res = await createClient(baseUrl).post("/api/auth/signup", {
      email: "short@example.test",
      password: "abc",
    });
    expect(res.status).toBe(400);
  });

  it("answers the same for an unknown account and a wrong password", async () => {
    const anon = createClient(baseUrl);
    const unknown = await anon.post("/api/auth/signin", { email: "nobody@example.test", password: PASSWORD });
    const wrong = await anon.post("/api/auth/signin", { email: "alice@example.test", password: "wrong-passphrase" });

    // Any difference here tells an attacker which addresses have accounts.
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error).toBe(wrong.body.error);
    expect(unknown.status).toBe(401);
  });

  // ─── Isolation between accounts ───────────────────────────────────────────

  it("gives each account its own budget", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    const bob = createClient(baseUrl);
    await bob.post("/api/auth/signup", { email: "bob@example.test", password: PASSWORD });

    const aliceSnapshot = {
      version: 1,
      revision: 0,
      settings: { selectedYear: 2026, selectedMonth: 3, baseCurrency: "EUR", monthlyBudget: 1111 },
      categories: [{ id: "alice-cat", name: "Alice only", bucket: "general", color: "#111111" }],
      years: {},
      seasonalPresets: [], scenarioPresets: [], budgetApprovals: [], auditLog: [],
    };
    const bobSnapshot = {
      ...aliceSnapshot,
      settings: { ...aliceSnapshot.settings, monthlyBudget: 2222 },
      categories: [{ id: "bob-cat", name: "Bob only", bucket: "general", color: "#222222" }],
    };

    expect((await alice.request("/api/snapshot", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(aliceSnapshot),
    })).status).toBe(200);
    expect((await bob.request("/api/snapshot", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bobSnapshot),
    })).status).toBe(200);

    const aliceLoaded = await alice.request("/api/snapshot");
    const bobLoaded = await bob.request("/api/snapshot");

    expect(aliceLoaded.body.settings.monthlyBudget).toBe(1111);
    expect(bobLoaded.body.settings.monthlyBudget).toBe(2222);
    expect(aliceLoaded.body.categories.map((c: any) => c.name)).toEqual(["Alice only"]);
    expect(bobLoaded.body.categories.map((c: any) => c.name)).toEqual(["Bob only"]);
  });

  it("keeps revision counters independent", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    const bob = createClient(baseUrl);
    await bob.post("/api/auth/signin", { email: "bob@example.test", password: PASSWORD });

    const before = (await bob.request("/api/snapshot/revision")).body.revision;

    const snapshot = (await alice.request("/api/snapshot")).body;
    await alice.request("/api/snapshot", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...snapshot, baseRevision: snapshot.revision }),
    });

    // A shared counter would make one account's save look like a conflict to
    // the other, and the app resolves conflicts by reloading — silently
    // discarding local work.
    expect((await bob.request("/api/snapshot/revision")).body.revision).toBe(before);
  });

  // ─── Sessions ─────────────────────────────────────────────────────────────

  it("revokes the session server-side on sign-out, not just the cookie", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    const token = alice.cookies.get("budget_session")!;

    await alice.post("/api/auth/signout", {});
    expect(alice.cookies.has("budget_session")).toBe(false);

    // Replay the exact token. Clearing only the cookie would leave it valid
    // anywhere it had been copied.
    const replay = await fetch(`${baseUrl()}/api/snapshot`, {
      headers: { Cookie: `budget_session=${token}` },
    });
    expect(replay.status).toBe(401);
  });

  it("ignores a forged or unknown session token", async () => {
    const res = await fetch(`${baseUrl()}/api/snapshot`, {
      headers: { Cookie: "budget_session=not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("stores only a hash of the session token", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    const token = alice.cookies.get("budget_session")!;

    const rows = await client.query(`SELECT token_hash FROM sessions`);
    const hashes = rows.rows.map((r) => r.token_hash);
    // A database dump must not yield a usable session.
    expect(hashes).not.toContain(token);
    expect(hashes.length).toBeGreaterThan(0);
  });

  it("marks the cookie HttpOnly so script cannot read it", async () => {
    const response = await fetch(`${baseUrl()}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.test", password: PASSWORD }),
    });
    const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [response.headers.get("set-cookie") ?? ""];
    const session = setCookie.find((line) => line.startsWith("budget_session="))!;
    expect(session.toLowerCase()).toContain("httponly");
    expect(session.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects an expired session", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    expect((await alice.request("/api/snapshot")).status).toBe(200);

    // Expiry is compared in the database, so a wrong clock on one instance
    // cannot extend a session.
    await client.query(`UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute'`);
    expect((await alice.request("/api/snapshot")).status).toBe(401);
  });

  // ─── Password reset ───────────────────────────────────────────────────────

  it("answers identically whether or not the address has an account", async () => {
    const anon = createClient(baseUrl);
    const known = await anon.post("/api/auth/forgot-password", { email: "alice@example.test" });
    const unknown = await anon.post("/api/auth/forgot-password", { email: "ghost@example.test" });

    expect(known.status).toBe(unknown.status);
    expect(known.body).toEqual(unknown.body);
  });

  it("resets the password with a one-time token and signs every device out", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    const otherDevice = createClient(baseUrl);
    await otherDevice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD });
    expect((await otherDevice.request("/api/snapshot")).status).toBe(200);

    await alice.post("/api/auth/forgot-password", { email: "alice@example.test" });

    // Only the hash is stored, so the suite takes the token the way the email
    // would deliver it: by generating one and checking the stored hash matches.
    // Instead, read it back through the same one-way function.
    const { createToken, hashToken } = await import("../server/src/auth/tokens");
    const replacement = createToken();
    await client.query(`UPDATE password_reset_tokens SET token_hash = $1 WHERE used_at IS NULL`, [
      hashToken(replacement),
    ]);

    const newPassword = "an-entirely-different-passphrase";
    const reset = await createClient(baseUrl).post("/api/auth/reset-password", {
      token: replacement,
      password: newPassword,
    });
    expect(reset.status).toBe(200);

    // The token is spent.
    const replay = await createClient(baseUrl).post("/api/auth/reset-password", {
      token: replacement,
      password: "yet-another-passphrase",
    });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe("invalid_token");

    // Sessions opened before the reset are gone — including one held by
    // whoever prompted the reset.
    expect((await otherDevice.request("/api/snapshot")).status).toBe(401);

    // Old password no longer works; new one does.
    const stale = await createClient(baseUrl).post("/api/auth/signin", {
      email: "alice@example.test", password: PASSWORD,
    });
    expect(stale.status).toBe(401);

    const fresh = createClient(baseUrl);
    expect((await fresh.post("/api/auth/signin", {
      email: "alice@example.test", password: newPassword,
    })).status).toBe(200);
    // The budget survived the password change untouched.
    expect((await fresh.request("/api/snapshot")).body.settings.monthlyBudget).toBe(1111);
  });

  it("rejects an unknown reset token", async () => {
    const res = await createClient(baseUrl).post("/api/auth/reset-password", {
      token: "made-up",
      password: "a-long-enough-passphrase-2",
    });
    expect(res.status).toBe(400);
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────

  it("throttles repeated failed sign-ins", async () => {
    const anon = createClient(baseUrl);
    const email = "throttle@example.test";
    await createClient(baseUrl).post("/api/auth/signup", { email, password: PASSWORD });

    let sawRateLimit = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const res = await anon.post("/api/auth/signin", { email, password: "definitely-wrong" });
      if (res.status === 429) {
        expect(res.body.code).toBe("rate_limited");
        sawRateLimit = true;
        break;
      }
    }
    // Without a cap, an unattended endpoint is an offline password cracker with
    // the server doing the work.
    expect(sawRateLimit).toBe(true);
  });
  it("gives every account a fresh budget, including the first", async () => {
    // An earlier version had the first account adopt a pre-existing "active"
    // budget. That made the first account different from every other one and
    // handed whoever signed up first a budget they had not created.
    const rows = await client.query(`SELECT snapshot_id FROM users ORDER BY created_at`);
    const ids = rows.rows.map((r) => r.snapshot_id as string);
    expect(ids.length).toBeGreaterThan(1);
    expect(ids).not.toContain("active");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
