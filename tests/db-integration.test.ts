/**
 * Real PostgreSQL integration tests.
 *
 * These exercise the actual schema DDL, migrations, and SnapshotRepository SQL
 * against a live PostgreSQL server rather than a mock. Unit tests with a mocked
 * `sql` tag cannot catch problems such as multi-statement templates, integer
 * literals bound to BOOLEAN columns, or broken ON CONFLICT targets — all of
 * which only fail against a real engine.
 *
 * The suite is skipped unless TEST_DATABASE_URL points at a disposable
 * PostgreSQL database. Run it with, for example:
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget_test npm test
 *
 * The Neon serverless driver speaks HTTP, so it cannot target a plain local
 * server. `pgTagAdapter` below provides the exact surface the repository uses
 * (tagged template + `.transaction([...])`), so the SQL under test is
 * byte-for-byte what production sends to Neon.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { initializeSchema } from "../server/src/db/schema";
import { runMigrations } from "../server/src/migrations";
import { SnapshotRepository } from "../server/src/repositories/SnapshotRepository";
import { createSeedBudgetSnapshot } from "../src/data/seedBudget";
import type { BudgetSnapshot } from "../src/domain/types";
import { activityFundingKind } from "../src/domain/funding";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Adapt node-postgres to the Neon driver's call shape:
 *   sql`SELECT ...`                    → tagged template with $1..$n params
 *   sql.transaction([q1, q2, ...])     → all queries in one transaction
 * Unexecuted queries are represented as thunks so `transaction` can run them
 * inside BEGIN/COMMIT, matching Neon's batch semantics.
 */
/** Private schema for this suite; also what the schema assertions look in. */
const TEST_SCHEMA = "test_repo";

function pgTagAdapter(client: Client) {
  const build = (strings: TemplateStringsArray, params: unknown[]) => {
    let text = "";
    strings.forEach((part, i) => {
      text += part;
      if (i < params.length) text += `$${i + 1}`;
    });
    return { text, params };
  };

  const sql: any = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const { text, params: values } = build(strings, params);
    const thenable = {
      __query: { text, values },
      then(resolve: any, reject: any) {
        return client
          .query(text, values)
          .then((r) => r.rows)
          .then(resolve, reject);
      },
    };
    return thenable;
  };

  sql.transaction = async (queries: any[]) => {
    await client.query("BEGIN");
    try {
      const out = [];
      for (const q of queries) {
        const { text, values } = q.__query;
        out.push((await client.query(text, values)).rows);
      }
      await client.query("COMMIT");
      return out;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  };

  return sql;
}

describeDb("PostgreSQL integration", () => {
  let client: Client;
  let sql: any;
  let repo: SnapshotRepository;

  beforeAll(async () => {
    client = new Client({ connectionString });
    await client.connect();
    // Each integration suite owns a private schema so suites stay isolated even
    // when Vitest runs their files in parallel against one database.
    await client.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE;`);
    await client.query(`CREATE SCHEMA ${TEST_SCHEMA};`);
    await client.query(`SET search_path TO ${TEST_SCHEMA};`);
    sql = pgTagAdapter(client);
    repo = new SnapshotRepository(sql);
  }, 30000);

  afterAll(async () => {
    await client?.end();
  });

  it("creates the full schema and runs migrations without error", async () => {
    await initializeSchema(sql);
    await runMigrations(sql);

    // Scoped to the schema this suite actually builds in. It used to look in
    // 'public', where nothing is created, so the list came back empty and the
    // assertion could never pass — the test reported a failure regardless of
    // whether the schema was correct.
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [TEST_SCHEMA],
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "activities", "audit_log", "budget_approvals", "categories", "closed_months",
        "migrations", "scenario_presets", "seasonal_presets", "snapshots",
        "spending_entries", "wallet_entries", "wishlist_items", "years",
      ]),
    );

    const columnsOf = async (table: string): Promise<string[]> => {
      const res = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
        [TEST_SCHEMA, table],
      );
      return res.rows.map((r) => r.column_name);
    };

    // The revision column backs optimistic concurrency.
    expect(await columnsOf("snapshots")).toContain("revision");

    // Migration 006. Without an owner column on budget_approvals the
    // repository cannot scope the read, and approvals are permanent financial
    // records shared across every budget in the database.
    expect(await columnsOf("budget_approvals")).toContain("snapshot_id");
    expect(await columnsOf("categories")).toContain("seed_key");

    // Every migration must be recorded, or it re-runs on every boot.
    const applied = await client.query(`SELECT name FROM migrations ORDER BY name`);
    expect(applied.rows.map((r) => r.name)).toContain("006-tenant-isolation");
  });

  it("survives concurrent migration runs", async () => {
    // The startup hook and the first HTTP request both call initializeDatabase.
    // "Check then insert" let both see no row, both insert, and the loser crash
    // on the unique constraint — which took the whole API down with a 503 and
    // showed as "offline" in the UI even though the database was fine.
    await Promise.all([
      runMigrations(sql),
      runMigrations(sql),
      runMigrations(sql),
    ]);

    const rows = await client.query(`SELECT name, count(*)::int AS n FROM migrations GROUP BY name`);
    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      expect(row.n).toBe(1);
    }
  });

  it("is idempotent when schema initialization runs twice", async () => {
    await initializeSchema(sql);
    await runMigrations(sql);
    const migrations = await client.query(`SELECT name FROM migrations ORDER BY name`);
    // Each migration recorded exactly once despite repeated runs.
    expect(new Set(migrations.rows.map((r) => r.name)).size).toBe(migrations.rows.length);
  });

  it("saves and reloads the seed snapshot with values intact", async () => {
    const snapshot = createSeedBudgetSnapshot();
    snapshot.revision = 1;
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    expect(loaded).not.toBeNull();
    expect(loaded!.revision).toBe(1);
    expect(loaded!.categories.length).toBe(snapshot.categories.length);

    const seedYear = Object.values(snapshot.years)[0];
    const loadedYear = loaded!.years[String(seedYear.year)];
    expect(loadedYear).toBeDefined();
    expect(loadedYear.year).toBe(seedYear.year);
    expect(loadedYear.activities.length).toBe(seedYear.activities.length);
  });

  it("round-trips booleans as booleans, not integers", async () => {
    const snapshot = createSeedBudgetSnapshot();
    snapshot.revision = 2;
    const year = Object.values(snapshot.years)[0];
    year.activities[0].active = true;
    year.activities[0].visible = false;
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const activity = loaded!.years[String(year.year)].activities.find((a) => a.id === year.activities[0].id)!;
    expect(activity.active).toBe(true);
    expect(activity.visible).toBe(false);
  });

  it("assigns spending entries the correct year even when year ids carry suffixes", async () => {
    const snapshot = createSeedBudgetSnapshot();
    snapshot.revision = 3;
    const year = Object.values(snapshot.years)[0];
    year.spendingEntries.push({
      id: "spend-integration-1",
      year: year.year,
      month: 7,
      week: 28,
      date: `${year.year}-07-09`,
      categoryId: snapshot.categories[0].id,
      amount: 42.5,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "integration",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const entry = loaded!.years[String(year.year)].spendingEntries.find((e) => e.id === "spend-integration-1")!;
    expect(entry).toBeDefined();
    expect(entry.year).toBe(year.year);
    expect(entry.amount).toBe(42.5);
    expect(entry.isPiloting).toBe(false);
  });

  it("preserves a zero amount as zero rather than dropping it", async () => {
    // Build on the stored snapshot: saving a fresh seed would (correctly)
    // prune entries added by earlier tests.
    const snapshot = (await repo.loadSnapshot("active"))!;
    snapshot.revision = 4;
    const year = Object.values(snapshot.years)[0];
    year.spendingEntries.push({
      id: "spend-zero",
      year: year.year,
      month: 7,
      week: 28,
      date: `${year.year}-07-10`,
      categoryId: snapshot.categories[0].id,
      amount: 0,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "zero is a real value",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const entry = loaded!.years[String(year.year)].spendingEntries.find((e) => e.id === "spend-zero")!;
    expect(entry).toBeDefined();
    expect(entry.amount).toBe(0);
  });

  it("updates an entry in place without duplicating or deleting siblings", async () => {
    const before = await repo.loadSnapshot("active");
    const year = Object.values(before!.years)[0];
    const countBefore = year.spendingEntries.length;

    const target = year.spendingEntries.find((e) => e.id === "spend-integration-1")!;
    target.amount = 99.5;
    target.note = "edited";
    before!.revision = 5;
    await repo.saveSnapshot(before!, "active");

    const after = await repo.loadSnapshot("active");
    const afterYear = after!.years[String(year.year)];
    expect(afterYear.spendingEntries.length).toBe(countBefore);
    const edited = afterYear.spendingEntries.find((e) => e.id === "spend-integration-1")!;
    expect(edited.amount).toBe(99.5);
    expect(edited.note).toBe("edited");
    // Sibling untouched
    expect(afterYear.spendingEntries.find((e) => e.id === "spend-zero")!.amount).toBe(0);
  });

  it("deletes only entries removed from the snapshot", async () => {
    const snapshot = await repo.loadSnapshot("active");
    const year = Object.values(snapshot!.years)[0];
    year.spendingEntries = year.spendingEntries.filter((e) => e.id !== "spend-zero");
    const remaining = year.spendingEntries.length;
    snapshot!.revision = 6;
    await repo.saveSnapshot(snapshot!, "active");

    const after = await repo.loadSnapshot("active");
    const afterYear = after!.years[String(year.year)];
    expect(afterYear.spendingEntries.length).toBe(remaining);
    expect(afterYear.spendingEntries.find((e) => e.id === "spend-zero")).toBeUndefined();
    expect(afterYear.spendingEntries.find((e) => e.id === "spend-integration-1")).toBeDefined();
  });

  it("keeps budget approvals as immutable historical records across saves", async () => {
    const snapshot = await repo.loadSnapshot("active");
    snapshot!.budgetApprovals = [
      {
        id: "approval-integration-1",
        year: 2026,
        month: 7,
        suggestedAmount: 500,
        approvedAmount: 500,
        currency: "EUR",
        status: "approved",
        recurringTotal: 475,
        createdAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        note: "integration approval",
      },
    ];
    snapshot!.revision = 7;
    await repo.saveSnapshot(snapshot!, "active");

    // A later save that omits the approval must NOT delete it.
    const next = await repo.loadSnapshot("active");
    next!.budgetApprovals = [];
    next!.revision = 8;
    await repo.saveSnapshot(next!, "active");

    const final = await repo.loadSnapshot("active");
    expect(final!.budgetApprovals.find((a) => a.id === "approval-integration-1")).toBeDefined();
    expect(final!.budgetApprovals.find((a) => a.id === "approval-integration-1")!.approvedAmount).toBe(500);
  });

  it("rolls the whole batch back when one statement in the transaction fails", async () => {
    const snapshot = await repo.loadSnapshot("active");
    const year = Object.values(snapshot!.years)[0];
    const goodId = `spend-tx-good-${Date.now()}`;
    year.spendingEntries.push({
      id: goodId,
      year: year.year,
      month: 7,
      week: 28,
      date: `${year.year}-07-11`,
      categoryId: snapshot!.categories[0].id,
      amount: 10,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "should roll back",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Violates the categories FK, so the batch must abort.
    year.spendingEntries.push({
      id: `spend-tx-bad-${Date.now()}`,
      year: year.year,
      month: 7,
      week: 28,
      date: `${year.year}-07-11`,
      categoryId: "category-that-does-not-exist",
      amount: 20,
      currency: "EUR",
      recurrenceType: "none",
      isPiloting: false,
      source: "personal",
      note: "bad fk",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    snapshot!.revision = 9;

    await expect(repo.saveSnapshot(snapshot!, "active")).rejects.toBeTruthy();

    const after = await repo.loadSnapshot("active");
    const afterYear = after!.years[String(year.year)];
    // The valid row from the same failed batch must not have been committed.
    expect(afterYear.spendingEntries.find((e) => e.id === goodId)).toBeUndefined();
    // Pre-existing data survives untouched.
    expect(afterYear.spendingEntries.find((e) => e.id === "spend-integration-1")).toBeDefined();
  });

  it("round-trips the historical-edit audit flag through the database", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    snapshot.auditLog.unshift(
      {
        id: "audit-historical-1",
        type: "spending",
        summary: "Added spending entry. (historical edit · July 2026)",
        createdAt: new Date().toISOString(),
        historicalEdit: true,
        historicalPeriod: "July 2026",
      },
      {
        id: "audit-normal-1",
        type: "spending",
        summary: "Added spending entry.",
        createdAt: new Date().toISOString(),
        historicalEdit: false,
      },
    );
    snapshot.revision = 15;
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const flagged = loaded!.auditLog.find((entry) => entry.id === "audit-historical-1")!;
    const normal = loaded!.auditLog.find((entry) => entry.id === "audit-normal-1")!;

    expect(flagged.historicalEdit).toBe(true);
    expect(flagged.historicalPeriod).toBe("July 2026");
    expect(normal.historicalEdit).toBe(false);
    expect(normal.historicalPeriod).toBeUndefined();
  });

  it("keeps audit entries when a later save omits them", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    snapshot.auditLog = [];
    snapshot.revision = 16;
    await repo.saveSnapshot(snapshot, "active");

    // The audit trail is history: dropping it from a payload must not erase it.
    const loaded = await repo.loadSnapshot("active");
    expect(loaded!.auditLog.find((entry) => entry.id === "audit-historical-1")).toBeDefined();
  });

  it("round-trips activity presentation and schedule fields", async () => {
    // These were previously dropped: the repository upserted a fixed column
    // list, so an icon, colour or schedule silently vanished on the next sync.
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const activity = year.activities[0];
    activity.icon = "Volleyball";
    activity.color = "#8B5CF6";
    activity.costModel = "schedule";
    activity.sessionsPerMonth = 8;
    activity.weekdays = [1, 3];
    activity.dayOfMonth = 15;
    activity.startDate = "2026-03-01";
    snapshot.revision = 30;
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const restored = loaded!.years[String(year.year)].activities.find((a) => a.id === activity.id)!;
    expect(restored.icon).toBe("Volleyball");
    expect(restored.color).toBe("#8B5CF6");
    expect(restored.costModel).toBe("schedule");
    expect(restored.sessionsPerMonth).toBe(8);
    expect(restored.weekdays).toEqual([1, 3]);
    expect(restored.dayOfMonth).toBe(15);
    expect(restored.startDate).toBe("2026-03-01");
  });

  it("leaves schedule fields undefined when an activity has none", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const activity = year.activities[1] ?? year.activities[0];
    activity.weekdays = [];
    snapshot.revision = 31;
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const restored = loaded!.years[String(year.year)].activities.find((a) => a.id === activity.id)!;
    // An empty set is "no schedule", not an empty array to reason about later.
    expect(restored.weekdays).toBeUndefined();
  });

  it("saves a wishlist item that has no dateAdded rather than rejecting the whole budget", async () => {
    /*
     * The bug this exists for cost an entire account's persistence.
     *
     * `date_added` is NOT NULL and was the one column on the row passed
     * through raw while every neighbour is coerced. One item without it — from
     * an import, an older client, or any path that does not go through
     * `addWishlistItem` — made the *snapshot* write fail, and the interface
     * reported that as "Offline — this device only". The server was reachable
     * and refusing, and nothing had saved for the whole session.
     */
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    year.wishlistItems.push({
      id: "wish-undated",
      name: "Item with no date",
      categoryId: snapshot.categories[0].id,
      actualPrice: 10,
      effectiveValue: 10,
      currency: "EUR",
      bought: false,
      inWishlist: true,
      priority: "low",
      active: true,
      notes: "",
      // Deliberately absent, which is the whole point.
      dateAdded: undefined as unknown as string,
    });

    await repo.saveSnapshot(snapshot, "active");
    const reloaded = (await repo.loadSnapshot("active"))!;
    const saved = Object.values(reloaded.years)
      .flatMap((record) => record.wishlistItems)
      .find((item) => item.id === "wish-undated");

    expect(saved, "the item was not saved").toBeDefined();
    // Defaulted rather than invented from nothing: it has to be a real date.
    expect(saved!.dateAdded).toBeTruthy();
    expect(Number.isFinite(Date.parse(saved!.dateAdded))).toBe(true);
    // And the rest of the budget survived the write.
    expect(Object.values(reloaded.years)[0].wishlistItems.length).toBeGreaterThan(0);
  });

  it("round-trips wishlist links and the wishlist↔spending relationship", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];

    year.wishlistItems.push({
      id: "wish-link-1",
      name: "Headphones",
      categoryId: snapshot.categories[0].id,
      actualPrice: 199,
      effectiveValue: 199,
      currency: "EUR",
      bought: false,
      inWishlist: true,
      priority: "high",
      dateAdded: new Date().toISOString(),
      notes: "",
      active: true,
      url: "https://example.com/headphones",
      color: "#0EA5B7",
      linkedSpendingId: "spend-link-1",
    });
    year.spendingEntries.push({
      id: "spend-link-1",
      year: year.year,
      month: 8,
      week: 33,
      date: `${year.year}-08-14`,
      categoryId: snapshot.categories[0].id,
      amount: 199,
      currency: "EUR",
      recurrenceType: "purchase",
      isPiloting: false,
      source: "personal",
      note: "Headphones",
      wishlistItemId: "wish-link-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    snapshot.revision = 32;
    await repo.saveSnapshot(snapshot, "active");

    const loaded = await repo.loadSnapshot("active");
    const restoredYear = loaded!.years[String(year.year)];
    const item = restoredYear.wishlistItems.find((w) => w.id === "wish-link-1")!;
    const entry = restoredYear.spendingEntries.find((e) => e.id === "spend-link-1")!;

    expect(item.url).toBe("https://example.com/headphones");
    expect(item.color).toBe("#0EA5B7");
    expect(item.linkedSpendingId).toBe("spend-link-1");
    expect(entry.wishlistItemId).toBe("wish-link-1");
  });

  it("exposes the stored revision for optimistic concurrency checks", async () => {
    const snapshot = await repo.loadSnapshot("active");
    snapshot!.revision = 20;
    await repo.saveSnapshot(snapshot!, "active");
    expect(await repo.loadRevision("active")).toBe(20);
  });
  // ─── Two budgets in one database ──────────────────────────────────────────
  //
  // Every one of these failed before migration 006 and the per-budget seed ids.
  // They are the reason this work exists: authentication is pointless if the
  // second account created silently overwrites the first one's records.

  it("keeps two budgets' categories separate when both are seeded", async () => {
    const alice = createSeedBudgetSnapshot();
    const bob = createSeedBudgetSnapshot();

    // Distinguishable, and only in Bob's copy.
    const bobHealth = bob.categories.find((c) => c.seedKey === "cat-health")!;
    bobHealth.name = "Bob's Health";
    bobHealth.color = "#123456";

    await repo.saveSnapshot(alice, "user-alice");
    await repo.saveSnapshot(bob, "user-bob");

    const loadedAlice = await repo.loadSnapshot("user-alice");
    const loadedBob = await repo.loadSnapshot("user-bob");

    // Both budgets keep a full category set. With shared seed ids, the second
    // save took over the first's rows and Alice was left with none.
    expect(loadedAlice!.categories.length).toBe(alice.categories.length);
    expect(loadedBob!.categories.length).toBe(bob.categories.length);

    const aliceHealth = loadedAlice!.categories.find((c) => c.seedKey === "cat-health")!;
    expect(aliceHealth.name).toBe("Health");
    expect(aliceHealth.color).not.toBe("#123456");

    // No row is shared between them.
    const aliceIds = new Set(loadedAlice!.categories.map((c) => c.id));
    const overlap = loadedBob!.categories.filter((c) => aliceIds.has(c.id));
    expect(overlap).toEqual([]);
  });

  it("does not leak budget approvals between budgets", async () => {
    const approval = (id: string, amount: number) => ({
      id,
      year: 2026,
      month: 3,
      suggestedAmount: amount,
      approvedAmount: amount,
      currency: "EUR" as const,
      status: "approved" as const,
      recurringTotal: amount,
      createdAt: "2026-03-01T00:00:00.000Z",
      decidedAt: "2026-03-02T00:00:00.000Z",
      note: `approval note for ${id}`,
    });

    const alice = await repo.loadSnapshot("user-alice");
    const bob = await repo.loadSnapshot("user-bob");
    alice!.budgetApprovals = [approval("approval-alice", 1000)];
    bob!.budgetApprovals = [approval("approval-bob", 2000)];

    await repo.saveSnapshot(alice!, "user-alice");
    await repo.saveSnapshot(bob!, "user-bob");

    // loadBudgetApprovals() used to read the whole table with no WHERE clause,
    // so each budget saw both rows — a disclosure of permanent financial
    // records across accounts.
    const reloadedAlice = await repo.loadSnapshot("user-alice");
    const reloadedBob = await repo.loadSnapshot("user-bob");

    expect(reloadedAlice!.budgetApprovals.map((a) => a.id)).toEqual(["approval-alice"]);
    expect(reloadedBob!.budgetApprovals.map((a) => a.id)).toEqual(["approval-bob"]);
    expect(reloadedAlice!.budgetApprovals[0].suggestedAmount).toBe(1000);
  });

  it("refuses to overwrite a row that belongs to another budget", async () => {
    const alice = await repo.loadSnapshot("user-alice");
    const stolen = { ...alice!.categories[0] };
    const originalName = stolen.name;

    // Force the collision the old seed produced by accident: Bob claims a row
    // id that Alice owns. The ON CONFLICT guard must leave Alice's row alone.
    const bob = await repo.loadSnapshot("user-bob");
    bob!.categories = [...bob!.categories, { ...stolen, name: "Hijacked", color: "#FF0000" }];
    await repo.saveSnapshot(bob!, "user-bob");

    const reloadedAlice = await repo.loadSnapshot("user-alice");
    const aliceRow = reloadedAlice!.categories.find((c) => c.id === stolen.id)!;
    expect(aliceRow).toBeDefined();
    expect(aliceRow.name).toBe(originalName);
    expect(aliceRow.color).not.toBe("#FF0000");
  });

  it("gives each budget its own seed identifiers", () => {
    const first = createSeedBudgetSnapshot();
    const second = createSeedBudgetSnapshot();

    const ids = (snap: BudgetSnapshot) => [
      ...snap.categories.map((c) => c.id),
      ...Object.values(snap.years).flatMap((y) => [
        ...y.activities.map((a) => a.id),
        ...y.spendingEntries.map((e) => e.id),
        ...y.wishlistItems.map((w) => w.id),
        ...y.walletEntries.map((w) => w.id),
      ]),
      ...snap.seasonalPresets.map((p) => p.id),
      ...snap.scenarioPresets.map((p) => p.id),
      ...snap.auditLog.map((l) => l.id),
    ];

    const firstIds = new Set(ids(first));
    const shared = ids(second).filter((id) => firstIds.has(id));
    expect(shared).toEqual([]);

    // Seed keys, unlike ids, are the stable part and must still match.
    expect(second.categories.map((c) => c.seedKey)).toEqual(first.categories.map((c) => c.seedKey));
  });

  it("keeps seasonal overrides pointing at this budget's activities", () => {
    const snap = createSeedBudgetSnapshot();
    const activityIds = new Set(Object.values(snap.years).flatMap((y) => y.activities.map((a) => a.id)));
    const referenced = snap.seasonalPresets.flatMap((preset) => Object.keys(preset.activityOverrides ?? {}));

    expect(referenced.length).toBeGreaterThan(0);
    // Overrides are keyed by activity id. Generating fresh activity ids without
    // rewriting these keys would leave every preset silently inert.
    for (const id of referenced) {
      expect(activityIds.has(id)).toBe(true);
    }
  });

  it("round-trips one-off schedule overrides", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    year.activities[0].weekdays = [1];
    year.activities[0].costModel = "schedule";
    year.activities[0].scheduleOverrides = [
      { id: "ovr-skip", kind: "skip", date: "2026-03-16", note: "away" },
      { id: "ovr-move", kind: "move", date: "2026-03-23", movedTo: "2026-03-25" },
      { id: "ovr-price", kind: "price", date: "2026-03-30", amount: 0 },
      { id: "ovr-extra", kind: "extra", date: "2026-03-11", amount: 45 },
    ];
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = await repo.loadSnapshot("active");
    const activity = Object.values(reloaded!.years)[0].activities.find((a) => a.id === year.activities[0].id)!;

    // The repository writes a fixed column list, so a field added to the model
    // but not to the schema, the upsert and the parser is silently dropped on
    // the next round-trip. That is what migration 005 existed to fix, and it is
    // why every persisted field needs a test like this one.
    expect(activity.scheduleOverrides).toHaveLength(4);
    const byId = Object.fromEntries((activity.scheduleOverrides ?? []).map((o) => [o.id, o]));
    expect(byId["ovr-skip"].kind).toBe("skip");
    expect(byId["ovr-move"].movedTo).toBe("2026-03-25");
    // Zero must survive as zero: a free session is a fact, not a missing price.
    expect(byId["ovr-price"].amount).toBe(0);
    expect(byId["ovr-extra"].amount).toBe(45);
  });

  it("round-trips notes against months", async () => {
    // `monthlyNotes` was in the model from the start and the loader returned a
    // hardcoded `{}` for it, so a note written against a month survived until
    // the next read from the server and then vanished. Migration 011 gives it
    // a column; this is the test that says it is actually wired end to end.
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    year.monthlyNotes = {
      1: { month: 1, note: "The boiler broke.", updatedAt: "2026-01-31T10:00:00Z" },
      7: { month: 7, note: "Two weeks away, so July is low.", updatedAt: "2026-07-31T10:00:00Z" },
    };
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    const notes = Object.values(reloaded.years)[0].monthlyNotes;
    expect(notes[1].note).toBe("The boiler broke.");
    expect(notes[7].note).toBe("Two weeks away, so July is low.");
    expect(notes[1].updatedAt).toBe("2026-01-31T10:00:00Z");
  });

  it("clears a note rather than storing an empty one", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    Object.values(snapshot.years)[0].monthlyNotes = {};
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    expect(Object.values(reloaded.years)[0].monthlyNotes).toEqual({});
  });

  it("survives a malformed monthly_notes value instead of failing the load", async () => {
    const loaded = (await repo.loadSnapshot("active"))!;
    // Every row for that year: the test schema can hold more than one snapshot,
    // and targeting the wrong one would leave the assertion reading an
    // untouched row and passing for the wrong reason.
    await client.query(`UPDATE years SET monthly_notes = $1::jsonb WHERE year = $2`, [
      // A month outside 1..12, an entry with no text, and a valid one.
      '{"0":{"note":"nope"},"3":{"note":""},"5":{"note":"kept"},"99":{"note":"nope"}}',
      Object.values(loaded.years)[0].year,
    ]);

    const reloaded = (await repo.loadSnapshot("active"))!;
    const notes = Object.values(reloaded.years)[0].monthlyNotes;
    expect(Object.keys(notes)).toEqual(["5"]);
    expect(notes[5].note).toBe("kept");
  });

  it("round-trips a manual next-renewal date", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const id = year.activities[0].id;
    year.activities[0].nextRenewalDate = "2027-03-04";
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    const activity = Object.values(reloaded.years)[0].activities.find((a) => a.id === id)!;
    expect(activity.nextRenewalDate).toBe("2027-03-04");

    // And clearing it stores absence, not an empty string.
    activity.nextRenewalDate = undefined;
    reloaded.revision = (reloaded.revision ?? 0) + 1;
    await repo.saveSnapshot(reloaded, "active");
    const cleared = (await repo.loadSnapshot("active"))!;
    expect(
      Object.values(cleared.years)[0].activities.find((a) => a.id === id)!.nextRenewalDate,
    ).toBeUndefined();
  });

  it("round-trips a session-pack payment cycle", async () => {
    // The whole model is three fields that must survive together: how often it
    // happens, in what unit, and how many sessions one payment covers. Losing
    // any one of them silently turns €200 every five weeks into something else.
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const id = year.activities[0].id;
    Object.assign(year.activities[0], {
      costModel: "sessionPack" as const,
      pricePerSession: 20,
      sessionsPerPeriod: 2,
      sessionPeriod: "week" as const,
      sessionsPerPayment: 10,
      nextRenewalDate: "2026-09-01",
    });
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    const activity = Object.values(reloaded.years)[0].activities.find((a) => a.id === id)!;
    expect(activity.costModel).toBe("sessionPack");
    expect(activity.pricePerSession).toBe(20);
    expect(activity.sessionsPerPeriod).toBe(2);
    expect(activity.sessionsPerPayment).toBe(10);
    // "week" is the default, so it is stored as absence rather than as a value
    // — which is also what every row written before this column existed says.
    expect(activity.sessionPeriod).toBeUndefined();

    // The monthly unit is a real, distinguishable value.
    activity.sessionPeriod = "month";
    reloaded.revision = (reloaded.revision ?? 0) + 1;
    await repo.saveSnapshot(reloaded, "active");
    const monthly = (await repo.loadSnapshot("active"))!;
    expect(
      Object.values(monthly.years)[0].activities.find((a) => a.id === id)!.sessionPeriod,
    ).toBe("month");
  });

  it("round-trips a fixed-yearly activity with its renewal baseline", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const id = year.activities[1].id;
    Object.assign(year.activities[1], {
      costModel: "fixedYearly" as const,
      yearlyEstimate: 60,
      nextRenewalDate: "2026-09-14",
    });
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    const activity = Object.values(reloaded.years)[0].activities.find((a) => a.id === id)!;
    expect(activity.costModel).toBe("fixedYearly");
    expect(activity.yearlyEstimate).toBe(60);
    expect(activity.nextRenewalDate).toBe("2026-09-14");
  });

  it("round-trips a custom activity icon, image link and icon source", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const id = year.activities[2].id;
    Object.assign(year.activities[2], {
      icon: "Plane",
      iconUrl: "https://cdn.example/marks/nebula.png",
      iconSourceUrl: "https://navigraph.example/",
    });
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    const activity = Object.values(reloaded.years)[0].activities.find((a) => a.id === id)!;
    expect(activity.icon).toBe("Plane");
    expect(activity.iconUrl).toBe("https://cdn.example/marks/nebula.png");
    expect(activity.iconSourceUrl).toBe("https://navigraph.example/");

    // Clearing stores absence, not an empty string that would render as a
    // broken image the next time the mark is resolved.
    activity.iconUrl = undefined;
    activity.iconSourceUrl = undefined;
    reloaded.revision = (reloaded.revision ?? 0) + 1;
    await repo.saveSnapshot(reloaded, "active");
    const cleared = Object.values((await repo.loadSnapshot("active"))!.years)[0].activities.find(
      (a) => a.id === id,
    )!;
    expect(cleared.iconUrl).toBeUndefined();
    expect(cleared.iconSourceUrl).toBeUndefined();
  });

  it("round-trips a wishlist item's custom image link", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const target = year.wishlistItems[0];
    target.iconUrl = "https://cdn.example/marks/a350.png";
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = (await repo.loadSnapshot("active"))!;
    expect(
      Object.values(reloaded.years)[0].wishlistItems.find((i) => i.id === target.id)!.iconUrl,
    ).toBe("https://cdn.example/marks/a350.png");
  });

  it("drops a malformed override instead of failing the whole load", async () => {
    // Target an activity that is actually part of the loaded snapshot: any row
    // in the table would do for the write, but the assertion reads it back
    // through loadSnapshot.
    const loaded = (await repo.loadSnapshot("active"))!;
    const id = Object.values(loaded.years)[0].activities[0].id;
    await client.query(`UPDATE activities SET schedule_overrides = $1 WHERE id = $2`, [
      '[{"id":"ok","kind":"skip","date":"2026-03-16"},{"nonsense":true},"garbage"]',
      id,
    ]);

    const reloaded = await repo.loadSnapshot("active");
    const activity = Object.values(reloaded!.years)[0].activities.find((a) => a.id === id)!;
    // One bad entry must not make the whole budget unloadable; the activity
    // still has its recurring rule and its valid exceptions.
    expect(activity.scheduleOverrides).toHaveLength(1);
    expect(activity.scheduleOverrides![0].id).toBe("ok");
  });
  it("round-trips the wishlist brand link separately from the purchase link", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const year = Object.values(snapshot.years)[0];
    const target = year.wishlistItems[0];
    target.url = "https://contrail-shop.example/products/rafale";
    target.brandUrl = "https://azurpoly.example/";
    snapshot.revision = (snapshot.revision ?? 0) + 1;
    await repo.saveSnapshot(snapshot, "active");

    const reloaded = await repo.loadSnapshot("active");
    const item = Object.values(reloaded!.years)[0].wishlistItems.find((w) => w.id === target.id)!;

    // Both survive, and neither overwrites the other. The repository writes a
    // fixed column list, so a field missing from the schema, the upsert or the
    // parser is silently dropped on the next round-trip.
    expect(item.url).toBe("https://contrail-shop.example/products/rafale");
    expect(item.brandUrl).toBe("https://azurpoly.example/");
  });

  it("leaves the brand link absent when it was never set", async () => {
    const snapshot = (await repo.loadSnapshot("active"))!;
    const item = Object.values(snapshot.years)[0].wishlistItems.find((w) => !w.brandUrl);
    // Undefined, not an empty string: "no brand" must stay distinguishable so
    // the icon falls back to the shop rather than resolving to nothing.
    expect(item?.brandUrl).toBeUndefined();
  });
});

/**
 * Upgrading a database that already holds data.
 *
 * Every suite above builds its schema from nothing, which is the one path that
 * cannot go wrong. Production is the other path: the tables already exist, so
 * `CREATE TABLE IF NOT EXISTS` is a no-op and only the migrations change
 * anything.
 *
 * That gap hid a live defect. `initializeSchema` runs before the migrations,
 * and it had gained `CREATE INDEX ... ON budget_approvals(snapshot_id)` — a
 * column migration 006 has not added yet at that point. Against an existing
 * database it failed with SQLSTATE 42703, which aborted initialization and
 * turned every request into a 503. A fresh database never noticed, because
 * there the CREATE TABLE really does create the column.
 */
describeDb("upgrading an existing database", () => {
  const LEGACY_SCHEMA = "test_legacy";
  let client: Client;
  let sql: any;

  beforeAll(async () => {
    client = new Client({ connectionString });
    await client.connect();
    await client.query(`DROP SCHEMA IF EXISTS ${LEGACY_SCHEMA} CASCADE;`);
    await client.query(`CREATE SCHEMA ${LEGACY_SCHEMA};`);
    await client.query(`SET search_path TO ${LEGACY_SCHEMA};`);

    // The shape these tables had before migration 006 — no snapshot_id on
    // budget_approvals, no seed_key on categories.
    await client.query(`
      CREATE TABLE snapshots (
        id TEXT PRIMARY KEY, version INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        settings TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );`);
    await client.query(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, name TEXT NOT NULL,
        bucket TEXT NOT NULL, color TEXT NOT NULL, monthly_cap DOUBLE PRECISION,
        notes TEXT, archived BOOLEAN DEFAULT false, icon TEXT, description TEXT, parent_id TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
      );`);
    await client.query(`
      CREATE TABLE budget_approvals (
        id TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL,
        suggested_amount DOUBLE PRECISION NOT NULL, approved_amount DOUBLE PRECISION,
        currency TEXT NOT NULL, status TEXT NOT NULL, recurring_total DOUBLE PRECISION NOT NULL,
        note TEXT, created_at TEXT NOT NULL, decided_at TEXT NOT NULL
      );`);

    // An `activities` table in its pre-013 shape, and a `wishlist_items` table
    // in its pre-013 shape. `CREATE TABLE IF NOT EXISTS` in schema.ts is a
    // no-op against these, so the new columns can only come from the migration
    // — which is exactly the path a deployed database takes.
    await client.query(`
      CREATE TABLE years (
        id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, year INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY(snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE,
        UNIQUE(snapshot_id, year)
      );`);
    await client.query(`
      CREATE TABLE activities (
        id TEXT PRIMARY KEY, year_id TEXT NOT NULL, name TEXT NOT NULL,
        category_id TEXT NOT NULL, currency TEXT NOT NULL, recurrence_type TEXT NOT NULL,
        recurrence_interval INTEGER NOT NULL, price_per_session DOUBLE PRECISION,
        price_per_purchase DOUBLE PRECISION, price_per_month DOUBLE PRECISION,
        estimated_cost DOUBLE PRECISION, yearly_estimate DOUBLE PRECISION,
        active BOOLEAN NOT NULL, visible BOOLEAN NOT NULL, seasonal_tag TEXT NOT NULL,
        "order" INTEGER NOT NULL, notes TEXT, icon TEXT, color TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );`);
    await client.query(`
      CREATE TABLE wishlist_items (
        id TEXT PRIMARY KEY, year_id TEXT NOT NULL, name TEXT NOT NULL,
        category_id TEXT NOT NULL, actual_price DOUBLE PRECISION,
        effective_value DOUBLE PRECISION, currency TEXT NOT NULL, bought BOOLEAN NOT NULL,
        in_wishlist BOOLEAN NOT NULL, priority TEXT NOT NULL, date_added TEXT NOT NULL,
        date_purchased TEXT, notes TEXT, active BOOLEAN NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );`);

    // A `scenario_presets` table in its pre-014 shape, so `activity_states`
    // can only have come from migration 014.
    await client.query(`
      CREATE TABLE scenario_presets (
        id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, name TEXT NOT NULL,
        monthly_budget DOUBLE PRECISION, pilot_included_in_budget BOOLEAN,
        category_caps TEXT, notes TEXT
      );`);

    // Data written by the old code: a seeded category keyed by its literal id,
    // and an approval with no owner.
    await client.query(
      `INSERT INTO snapshots (id, version, revision, settings, created_at, updated_at)
       VALUES ('active', 1, 3, '{}', 'then', 'then');`);
    await client.query(
      `INSERT INTO categories (id, snapshot_id, name, bucket, color)
       VALUES ('cat-health', 'active', 'Health', 'general', '#16A34A'),
              ('cat-abc123-user-made', 'active', 'Mine', 'general', '#000000');`);
    await client.query(
      `INSERT INTO budget_approvals
         (id, year, month, suggested_amount, approved_amount, currency, status, recurring_total, created_at, decided_at)
       VALUES ('legacy-approval', 2026, 2, 500, 500, 'EUR', 'approved', 400, 'then', 'then');`);
    // An activity and a scenario written before funding existed. Both must
    // still load, and both must read as the defaults.
    await client.query(
      `INSERT INTO years (id, snapshot_id, year, created_at, updated_at)
       VALUES ('year-active-2026', 'active', 2026, 'then', 'then');`);
    await client.query(
      `INSERT INTO activities
         (id, year_id, name, category_id, currency, recurrence_type, recurrence_interval,
          active, visible, seasonal_tag, "order", notes, created_at, updated_at)
       VALUES ('act-legacy', 'year-active-2026', 'Legacy', 'cat-health', 'EUR', 'monthly', 1,
               true, true, 'normal', 0, '', 'then', 'then');`);
    await client.query(
      `INSERT INTO scenario_presets (id, snapshot_id, name, monthly_budget, pilot_included_in_budget, notes)
       VALUES ('sc-legacy', 'active', 'Legacy scenario', 500, true, '');`);

    sql = pgTagAdapter(client);
  }, 30000);

  afterAll(async () => {
    await client?.end();
  });

  it("initializes and migrates without error", async () => {
    // The regression: this threw `column "snapshot_id" does not exist`.
    await expect(initializeSchema(sql)).resolves.not.toThrow();
    await expect(runMigrations(sql)).resolves.not.toThrow();
  });

  it("adds the owner column and adopts existing approvals", async () => {
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'budget_approvals'`,
      [LEGACY_SCHEMA],
    );
    expect(cols.rows.map((r) => r.column_name)).toContain("snapshot_id");

    // Rows that predate accounts belong to the one budget that existed.
    const rows = await client.query(`SELECT id, snapshot_id FROM budget_approvals`);
    expect(rows.rows).toEqual([{ id: "legacy-approval", snapshot_id: "active" }]);
  });

  it("backfills seed keys for seeded categories but not user-created ones", async () => {
    const rows = await client.query(`SELECT id, seed_key FROM categories ORDER BY id`);
    const bySeedKey = Object.fromEntries(rows.rows.map((r) => [r.id, r.seed_key]));

    // A row the old seed wrote: its id *is* the stable key.
    expect(bySeedKey["cat-health"]).toBe("cat-health");
    // A category the user created. It shares the `cat-` prefix, which is why
    // the backfill lists the ten seeded ids instead of matching LIKE 'cat-%'.
    expect(bySeedKey["cat-abc123-user-made"]).toBeNull();
  });

  it("adds the payment-cycle and icon columns to an existing database", async () => {
    // The failure mode this guards: a field exists in the client model, the
    // repository writes a fixed column list including it, and the column was
    // never added — every save then fails with 42703 rather than silently
    // dropping the value.
    const activityColumns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'activities'`,
      [LEGACY_SCHEMA],
    );
    const names = activityColumns.rows.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "sessions_per_period",
        "session_period",
        "sessions_per_payment",
        "icon_url",
        "icon_source_url",
      ]),
    );

    const wishlistColumns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'wishlist_items'`,
      [LEGACY_SCHEMA],
    );
    expect(wishlistColumns.rows.map((r) => r.column_name)).toContain("icon_url");
  });

  it("adds the funding columns and the scenario activity states", async () => {
    /*
     * Migration 014, against a database that already had data.
     *
     * The failure mode this guards is the one migration 005 exists for: a
     * field exists in the client model, the repository writes a fixed column
     * list including it, and the column was never added — so every save fails
     * with 42703 rather than silently dropping the value.
     */
    const activityColumns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'activities'`,
      [LEGACY_SCHEMA],
    );
    expect(activityColumns.rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining(["funding_source", "funded_by"]),
    );

    const scenarioColumns = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'scenario_presets'`,
      [LEGACY_SCHEMA],
    );
    expect(scenarioColumns.rows.map((r) => r.column_name)).toContain("activity_states");
  });

  it("leaves existing rows valid, and reading as the documented defaults", async () => {
    // Additive and nullable, so no backfill was needed — and NULL already
    // means "paid by me" and "every activity enabled" everywhere it is read.
    const activity = await client.query(`SELECT funding_source, funded_by FROM activities WHERE id = 'act-legacy'`);
    expect(activity.rows[0]).toEqual({ funding_source: null, funded_by: null });

    const scenario = await client.query(`SELECT activity_states FROM scenario_presets WHERE id = 'sc-legacy'`);
    expect(scenario.rows[0].activity_states).toBeNull();

    const repository = new SnapshotRepository(sql);
    const loaded = await repository.loadSnapshot("active");
    const loadedActivity = loaded?.years["2026"]?.activities.find((item) => item.id === "act-legacy");
    expect(loadedActivity?.fundingSource).toBeUndefined();
    expect(activityFundingKind(loadedActivity ?? {})).toBe("personal");
    const loadedScenario = loaded?.scenarioPresets.find((item) => item.id === "sc-legacy");
    expect(loadedScenario).toBeTruthy();
    expect(loadedScenario?.activityStates).toBeUndefined();
    // And it still loads, which is the whole promise of an additive migration.
    expect(loadedScenario?.monthlyBudget).toBe(500);
  });

  it("creates the index the migration owns", async () => {
    const rows = await client.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'budget_approvals'`,
      [LEGACY_SCHEMA],
    );
    expect(rows.rows.map((r) => r.indexname)).toContain("idx_budget_approvals_snapshot");
  });

  it("is safe to run twice, as every boot does", async () => {
    await expect(initializeSchema(sql)).resolves.not.toThrow();
    await expect(runMigrations(sql)).resolves.not.toThrow();
    const applied = await client.query(`SELECT name, count(*)::int AS n FROM migrations GROUP BY name`);
    for (const row of applied.rows) expect(row.n).toBe(1);
  });
});