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

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Adapt node-postgres to the Neon driver's call shape:
 *   sql`SELECT ...`                    → tagged template with $1..$n params
 *   sql.transaction([q1, q2, ...])     → all queries in one transaction
 * Unexecuted queries are represented as thunks so `transaction` can run them
 * inside BEGIN/COMMIT, matching Neon's batch semantics.
 */
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
    await client.query(`DROP SCHEMA IF EXISTS test_repo CASCADE;`);
    await client.query(`CREATE SCHEMA test_repo;`);
    await client.query(`SET search_path TO test_repo;`);
    sql = pgTagAdapter(client);
    repo = new SnapshotRepository(sql);
  }, 30000);

  afterAll(async () => {
    await client?.end();
  });

  it("creates the full schema and runs migrations without error", async () => {
    await initializeSchema(sql);
    await runMigrations(sql);

    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = tables.rows.map((r) => r.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        "activities", "audit_log", "budget_approvals", "categories", "closed_months",
        "migrations", "scenario_presets", "seasonal_presets", "snapshots",
        "spending_entries", "wallet_entries", "wishlist_items", "years",
      ]),
    );

    // The revision column backs optimistic concurrency.
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'snapshots'`,
    );
    expect(cols.rows.map((r) => r.column_name)).toContain("revision");
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

  it("exposes the stored revision for optimistic concurrency checks", async () => {
    const snapshot = await repo.loadSnapshot("active");
    snapshot!.revision = 20;
    await repo.saveSnapshot(snapshot!, "active");
    expect(await repo.loadRevision("active")).toBe(20);
  });
});
