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

  // ─── Remember Me ──────────────────────────────────────────────────────────

  it("leaves Remember Me sessions without a cookie expiry, but bounded server-side to a day", async () => {
    const response = await fetch(`${baseUrl()}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.test", password: PASSWORD, rememberMe: false }),
    });
    const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [response.headers.get("set-cookie") ?? ""];
    const session = setCookie.find((line) => line.startsWith("budget_session="))!;
    // No Max-Age and no Expires at all — a cookie carrying either one is a
    // persistent cookie by definition, whatever value it holds.
    expect(session.toLowerCase()).not.toContain("max-age");
    expect(session.toLowerCase()).not.toContain("expires=");

    const row = await client.query(
      `SELECT EXTRACT(EPOCH FROM (s.expires_at - s.created_at)) / 86400 AS days
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.email_normalized = 'alice@example.test'
       ORDER BY s.created_at DESC LIMIT 1`,
    );
    expect(Number(row.rows[0].days)).toBeCloseTo(1, 1);
  });

  it("gives a Remember Me session a persistent cookie and the full 30-day session", async () => {
    const response = await fetch(`${baseUrl()}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.test", password: PASSWORD, rememberMe: true }),
    });
    const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [response.headers.get("set-cookie") ?? ""];
    const session = setCookie.find((line) => line.startsWith("budget_session="))!;
    expect(session.toLowerCase()).toContain("max-age");

    const row = await client.query(
      `SELECT EXTRACT(EPOCH FROM (s.expires_at - s.created_at)) / 86400 AS days
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE u.email_normalized = 'alice@example.test'
       ORDER BY s.created_at DESC LIMIT 1`,
    );
    expect(Number(row.rows[0].days)).toBeCloseTo(30, 1);
  });

  it("treats a missing rememberMe the same as unchecked, not as remembered", async () => {
    // A client that predates this feature sends no field at all — that must
    // fail closed to the short, non-persistent session, not silently inherit
    // the 30-day behaviour every sign-in used to get unconditionally.
    const response = await fetch(`${baseUrl()}/api/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@example.test", password: PASSWORD }),
    });
    const setCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? [response.headers.get("set-cookie") ?? ""];
    const session = setCookie.find((line) => line.startsWith("budget_session="))!;
    expect(session.toLowerCase()).not.toContain("max-age");
  });

  it("still signs a Remember Me session out immediately on sign-out", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD, rememberMe: true });
    expect((await alice.request("/api/snapshot")).status).toBe(200);

    await alice.post("/api/auth/signout", {});
    expect((await alice.request("/api/snapshot")).status).toBe(401);
  });

  it("expires an unremembered session after its shorter server-side TTL", async () => {
    const alice = createClient(baseUrl);
    await alice.post("/api/auth/signin", { email: "alice@example.test", password: PASSWORD, rememberMe: false });
    expect((await alice.request("/api/snapshot")).status).toBe(200);

    // The same expiry check the "rejects an expired session" test uses —
    // this just confirms an unremembered session is bound by the database
    // row, the same enforcement path, and not by the cookie's own absence of
    // Max-Age (a browser that never closes would otherwise stay signed in
    // forever on an "unremembered" session).
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

  // ─── Changing the account itself ──────────────────────────────────────────

  it("refuses to change the address without the current password", async () => {
    const owner = createClient(baseUrl);
    await owner.post("/api/auth/signup", { email: "movable@example.test", password: PASSWORD });

    // Being signed in is not proof of being the owner. If it were, an
    // unattended session could move the account to an attacker's address and
    // take every future password reset with it.
    const res = await owner.post("/api/auth/change-email", {
      currentPassword: "not-the-password",
      email: "attacker@example.test",
    });
    expect(res.status).toBe(401);

    const after = await client.query(`SELECT email FROM users WHERE email_normalized = $1`, [
      "movable@example.test",
    ]);
    expect(after.rows).toHaveLength(1);
  });

  it("changes the address, keeps the session, and moves sign-in with it", async () => {
    const owner = createClient(baseUrl);
    await owner.post("/api/auth/signup", { email: "before@example.test", password: PASSWORD });

    const res = await owner.post("/api/auth/change-email", {
      currentPassword: PASSWORD,
      email: "After@example.test",
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("After@example.test");

    // The session survives: changing your own address should not throw you out
    // of the app you are standing in.
    expect((await owner.request("/api/auth/me")).body.user?.email).toBe("After@example.test");

    // Sign-in follows the new address and is case-insensitive, and the old one
    // stops working — otherwise the change would be cosmetic.
    const fresh = createClient(baseUrl);
    expect((await fresh.post("/api/auth/signin", { email: "after@example.test", password: PASSWORD })).status).toBe(200);
    const stale = createClient(baseUrl);
    expect((await stale.post("/api/auth/signin", { email: "before@example.test", password: PASSWORD })).status).toBe(401);
  });

  it("refuses an address another account already holds", async () => {
    const first = createClient(baseUrl);
    await first.post("/api/auth/signup", { email: "holder@example.test", password: PASSWORD });
    const second = createClient(baseUrl);
    await second.post("/api/auth/signup", { email: "mover@example.test", password: PASSWORD });

    // Case-insensitively: two accounts differing only in capitalisation would
    // make sign-in ambiguous.
    const res = await second.post("/api/auth/change-email", {
      currentPassword: PASSWORD,
      email: "HOLDER@example.test",
    });
    expect(res.status).toBe(409);
  });

  it("accepts the address the account already has", async () => {
    const owner = createClient(baseUrl);
    await owner.post("/api/auth/signup", { email: "samesame@example.test", password: PASSWORD });

    // Re-saving without changing anything, or correcting only capitalisation,
    // must not collide with the account's own row.
    const res = await owner.post("/api/auth/change-email", {
      currentPassword: PASSWORD,
      email: "SameSame@example.test",
    });
    expect(res.status).toBe(200);
  });

  it("changes the password, keeps this device, and signs the others out", async () => {
    const here = createClient(baseUrl);
    await here.post("/api/auth/signup", { email: "rotate@example.test", password: PASSWORD });
    const elsewhere = createClient(baseUrl);
    await elsewhere.post("/api/auth/signin", { email: "rotate@example.test", password: PASSWORD });
    expect((await elsewhere.request("/api/auth/me")).body.user).not.toBeNull();

    const next = "an-entirely-different-passphrase";
    expect((await here.post("/api/auth/change-password", { currentPassword: PASSWORD, newPassword: next })).status).toBe(200);

    // The device that made the change keeps working; every other session is
    // revoked, which is the point of changing a password.
    expect((await here.request("/api/auth/me")).body.user).not.toBeNull();
    expect((await elsewhere.request("/api/auth/me")).body.user).toBeNull();

    const fresh = createClient(baseUrl);
    expect((await fresh.post("/api/auth/signin", { email: "rotate@example.test", password: PASSWORD })).status).toBe(401);
    expect((await fresh.post("/api/auth/signin", { email: "rotate@example.test", password: next })).status).toBe(200);
  });

  // ─── Username authentication ─────────────────────────────────────────────
  //
  // Placed before rate limiting deliberately: "throttles repeated failed
  // sign-ins" below drives the shared per-IP bucket past its limit and never
  // resets it, since the whole point is to prove the limit sticks. Every
  // signin attempt in this suite shares one IP (the test server), so a
  // username test placed after it inherits a 429 that has nothing to do with
  // its own username.

  it("has no username until one is set", async () => {
    const bea = createClient(baseUrl);
    await bea.post("/api/auth/signup", { email: "bea@example.test", password: PASSWORD });
    const me = await bea.request("/api/auth/me");
    expect(me.body.user.username).toBeNull();
  });

  it("sets a username and signs in with it instead of the email", async () => {
    const bea = createClient(baseUrl);
    await bea.post("/api/auth/signin", { email: "bea@example.test", password: PASSWORD });
    const set = await bea.post("/api/auth/set-username", { username: "bea_the_budgeter" });
    expect(set.status).toBe(200);
    expect(set.body.user.username).toBe("bea_the_budgeter");

    const bySameName = createClient(baseUrl);
    const res = await bySameName.post("/api/auth/signin", {
      email: "BEA_THE_BUDGETER", // case-insensitive, like email
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("bea@example.test");
  });

  it("keeps signing in by email once a username exists", async () => {
    const bea = createClient(baseUrl);
    const res = await bea.post("/api/auth/signin", { email: "bea@example.test", password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("rejects a username that collides, case-insensitively, without touching the holder's account", async () => {
    const cara = createClient(baseUrl);
    await cara.post("/api/auth/signup", { email: "cara@example.test", password: PASSWORD });
    const res = await cara.post("/api/auth/set-username", { username: "Bea_The_Budgeter" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("username_taken");

    // The rejection did not silently overwrite the original owner's row.
    const check = await createClient(baseUrl).post("/api/auth/signin", {
      email: "bea_the_budgeter",
      password: PASSWORD,
    });
    expect(check.body.user.email).toBe("bea@example.test");
  });

  it("rejects usernames outside the allowed shape without reaching the database", async () => {
    const dan = createClient(baseUrl);
    await dan.post("/api/auth/signup", { email: "dan@example.test", password: PASSWORD });
    for (const bad of ["ab", "1abc", "has space", "has@sign", "-leadinghyphen", "x".repeat(25)]) {
      const res = await dan.post("/api/auth/set-username", { username: bad });
      expect(res.status, `"${bad}" must be refused`).toBe(400);
      expect(res.body.code).toBe("invalid_username");
    }
  });

  it("answers identically for an unknown username and a wrong password", async () => {
    const anon = createClient(baseUrl);
    const unknownUsername = await anon.post("/api/auth/signin", {
      email: "no_such_handle",
      password: PASSWORD,
    });
    const wrongPassword = await anon.post("/api/auth/signin", {
      email: "bea_the_budgeter",
      password: "wrong-passphrase",
    });
    expect(unknownUsername.status).toBe(wrongPassword.status);
    expect(unknownUsername.body.error).toBe(wrongPassword.body.error);
  });

  it("lets a username change without requiring the current password", async () => {
    // Unlike change-email and change-password: a username is a second way to
    // sign in, not a channel anything is recovered through, so requireAuth
    // alone is the bar — no currentPassword field is sent here at all.
    const bea = createClient(baseUrl);
    await bea.post("/api/auth/signin", { email: "bea@example.test", password: PASSWORD });
    const res = await bea.post("/api/auth/set-username", { username: "bobby" });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("bobby");
  });

  it("refuses set-username without a session", async () => {
    const anon = createClient(baseUrl);
    const res = await anon.post("/api/auth/set-username", { username: "ghost_user" });
    expect(res.status).toBe(401);
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
