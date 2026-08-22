# DATABASE.md

This document explains the philosophy, structure and long-term evolution of the database layer.

---

# Purpose

The database is the **single source of truth** for the application.

No financial information should exist only in memory.

The frontend should be considered a presentation layer.

Business data belongs in the database.

---

# Current Database

Database Engine

Neon PostgreSQL

The project previously used SQLite.

It has now migrated to Neon to support:

• cloud hosting

• future authentication

• synchronization

• scalability

• better deployment

SQLite should no longer be considered the reference implementation.

## Current verification status — 2026-08-15

The persistence layer has been verified against a **live PostgreSQL server**, not only against mocks. 71 integration tests cover schema DDL, migrations, repository SQL, and the full HTTP API path; a browser session was additionally driven end to end (UI → API → PostgreSQL → UI) including a two-device read/write cycle.

Migrations 011, 012 and 013 were additionally run against a database that **already held data** — the upgrade path that once answered every request with 503 — and confirmed to add their columns without touching a row. For 013 the test goes further: it creates `activities` and `wishlist_items` in their *pre-013* shape, so `CREATE TABLE IF NOT EXISTS` in `schema.ts` is a no-op against them and the new columns can only have come from the `ALTER`s. Removing any one of them makes the test fail, which is how it was checked.

The snapshot save flow performs targeted `ON CONFLICT (id) DO UPDATE SET ...` upserts for all top-level and nested child records (`activities`, `spending_entries`, `wishlist_items`, `wallet_entries`, `closed_months`, `categories`, `seasonal_presets`, `scenario_presets`). Only records removed from memory are deleted using targeted `NOT IN` queries. Whole-table deletions for year records have been eliminated.

### Defects found and fixed during live verification

These could not be observed with a mocked driver and were all failing in real PostgreSQL:

1. **Multi-statement DDL templates.** `initializeSchema` grouped `CREATE TABLE` and `CREATE INDEX` in single tagged templates. The Neon HTTP driver executes exactly one command per call, so schema creation failed. Every statement is now its own template.
2. **Integers bound to BOOLEAN columns.** Flags were written as `1`/`0`. PostgreSQL rejects an integer for `BOOLEAN` (SQLite tolerated it). All flags now bind real booleans.
3. **Year derived from a row-id suffix.** `parseSpendingEntry` recovered the year with `row.year_id.split("-").pop()`, but year ids embed `Date.now()`, so every loaded entry got a nonsensical year (falling back to a hard-coded `2026`). The year now comes from the `years` table.
4. **Non-atomic saves.** Each statement ran separately, so a mid-save failure left the database partly written. Writes are collected and executed through one `sql.transaction([...])` batch.
5. **Approvals and audit rows were subject to deletion passes.** Both are historical records and are now upsert-only.

### Migrations

| Migration | Adds |
| --- | --- |
| `001-initial-schema` | Checkpoint; tables are created by `schema.ts` |
| `002-add-category-metadata` | `categories.icon`, `.description`, `.parent_id` |
| `003-add-snapshot-revision` | `snapshots.revision` — optimistic concurrency |
| `004-add-audit-historical-edit` | `audit_log.historical_edit`, `.historical_period` |
| `005-add-activity-schedule-and-wishlist-links` | `activities.icon/color/cost_model/sessions_per_month/weekdays/day_of_month/start_date`, `wishlist_items.url/color/linked_spending_id`, `spending_entries.wishlist_item_id` |
| `006-tenant-isolation` | `budget_approvals.snapshot_id` (+ backfill to `active`), `categories.seed_key` (backfilled for the ten seeded ids only) |
| `007-authentication` | `users`, `sessions`, `password_reset_tokens`, `auth_attempts` |
| `008-schedule-overrides` | `activities.schedule_overrides` — one-off exceptions as a JSON array |
| `009-wishlist-brand-url` | `wishlist_items.brand_url` — where the icon comes from, separate from where the item is bought |
| `010-wishlist-icon` | `wishlist_items.icon` — an explicit library icon, which beats any favicon |
| `011-monthly-notes` | `years.monthly_notes` (JSONB, `DEFAULT '{}'`) — see below |
| `012-activity-next-renewal` | `activities.next_renewal_date` — a renewal date the recurrence rule cannot derive |
| `013-payment-cycles-and-icons` | `activities.sessions_per_period`, `session_period`, `sessions_per_payment`, `icon_url`, `icon_source_url`; `wishlist_items.icon_url` |

### `schema.ts` runs before the migrations, and that constrains what may go in it

This is not a style point. Migration 006 shipped with `CREATE INDEX ... ON budget_approvals(snapshot_id)` placed next to the table definition in `schema.ts`. On a **fresh** database that works, because the `CREATE TABLE` really does create the column. On an **existing** one, `CREATE TABLE IF NOT EXISTS` is a no-op, the column does not exist yet, and the index fails with SQLSTATE `42703` — aborting initialization and answering every request with 503.

The whole test suite passed, because every integration test built its schema from nothing: the one path that cannot go wrong was the only path under test.

Two rules follow:

1. **A column introduced by a migration may only be referenced by that migration or a later one**, never by `schema.ts`.
2. **A brand-new table is declared in its migration only**, not in both places. Two definitions can drift; one cannot. `users`, `sessions`, `password_reset_tokens` and `auth_attempts` follow this.

The `upgrading an existing database` suite now covers the path directly: it builds the pre-006 table shapes, inserts the kind of rows the old code wrote, and runs `initializeSchema` + `runMigrations` over them.

### Why 006 exists

Two defects made more than one budget per database impossible, and both corrupted data rather than merely leaking it.

- `budget_approvals` carried no owner column, and the repository read it with no `WHERE` clause — every budget would have loaded every other budget's approvals.
- The seed hardcoded its row ids (`cat-health`, `act-gym`, `wish-1`, …), which are primary keys in shared tables. `ON CONFLICT (id) DO UPDATE` rewrote the existing row's contents while leaving `snapshot_id` pointing at the original owner, so the second budget created took over the first one's rows. Ids are now generated per budget; `categories.seed_key` carries the stable identity the application matches on, and its values are the old ids so existing rows keep resolving.

The backfill lists the ten seeded ids explicitly rather than matching `LIKE 'cat-%'`, because user-created categories share that prefix and must not be labelled as seeded.

Every `ON CONFLICT (id) DO UPDATE` now also carries `WHERE <table>.<owner> = EXCLUDED.<owner>`, so a cross-budget id collision becomes a no-op instead of silent corruption. `EXCLUDED` consumes no placeholder, which matters because `queryHelper` splits on `/\$\d+/` and cannot reuse one.

### Write ordering inside `saveSnapshot`

Removed categories are deleted **after** the year writes, not before. `activities.category_id`, `spending_entries.category_id` and `wishlist_items.category_id` are `ON DELETE RESTRICT`, and PostgreSQL checks those statement by statement rather than at commit — so deleting a category before the rows referencing it have been rewritten aborts the whole transaction with a bare foreign-key error. Replacing a budget's entire category set, which an Excel import or a reset to seed does, hit exactly that.

Migration 005 exists because the repository writes a **fixed column list**: a field added to the TypeScript model but not to the schema, the upsert and the parser is silently dropped on the next server round-trip. Adding a persisted field means touching all four places, and the integration suite has a round-trip test per field group to catch the omission.

`activities.weekdays` stores a JSON array of ISO weekday numbers. A malformed value is read as "no schedule" rather than throwing, so one bad row cannot make the whole snapshot unloadable.

### Why 011 exists: a field that existed in the model and nowhere else

`YearRecord.monthlyNotes` was declared in `src/domain/types.ts` from the beginning, written by nothing, and — crucially — **read back as a hardcoded `{}`** by `loadYearRecord`. The type checked, the round trip appeared to work, and anything written survived exactly until the next read from the server.

This is the same class of defect migration 005 exists for, in its most deceptive form: not a field missing from the schema, but a field the loader *pretended* to load. A round-trip test catches both, which is why there is now one per persisted field group and three for this one alone — write and read back, clear and read back, and a deliberately malformed stored value.

`monthly_notes` is JSONB on the year row rather than a table of its own: there are at most twelve per year, they are always read with the year, and they are never queried across years. A table would add a join and a delete pass for nothing. `DEFAULT '{}'::jsonb` means every existing row is immediately valid with no backfill.

The parser accepts both an object (what the Neon driver returns for JSONB) and a string (what the local node-postgres adapter and older rows can present), and drops any entry whose month is outside 1–12 or whose text is empty — one bad row must not make a whole year unloadable.

### Why 012 is a plain column and not part of the schedule

`activities.next_renewal_date` is display-only: it overrides which date the upcoming timeline shows and **never** feeds an estimate. That is deliberate. Every other schedule field is an input to `monthlyEstimateNative`, so letting a typed date join them would mean one keystroke could rewrite a year of budget figures. Keeping it out of the schedule is what makes it safe to type a date you are unsure about.

### Why 013 splits a frequency from a payment cycle

`sessions_per_period` + `session_period` say how often the activity *happens*; `sessions_per_payment` says how many of those one payment covers. They are three columns because they are three facts, and collapsing them is precisely the error the `sessionPack` model exists to prevent — twice a week is not twice a week's worth of payments.

Two consequences worth knowing:

- **The payment amount is not stored.** It is `price_per_session × sessions_per_payment`, derived on read. A stored copy is a second answer that can disagree with the first, and money that disagrees with itself is the worst kind of bug this schema can carry.
- **`session_period` stores `'month'` or nothing.** `week` is the default and is written as absence, which is also what every row created before this column existed says — so old rows and new ones mean the same thing without a backfill.

`icon_url` and `icon_source_url` give an activity the identity options a wishlist item has had since migrations 009 and 010. `icon_source_url` is kept apart from any purchase or booking link for the same reason `wishlist_items.brand_url` is kept apart from `url`: where a thing is bought and who makes it are two different facts, and one column cannot carry both.

### Concurrency and multi-device safety

`snapshots.revision` backs a compare-and-swap. A client sends `baseRevision` — the revision it last read — and the write is accepted only if that still matches what is stored; the server then assigns the next revision.

Trusting a client-supplied `revision` was unsafe: a device editing while offline increments its own counter freely, so it could reconnect with a higher number and overwrite work another device had done. The current scheme cannot be gamed, because a stale base is exactly what gets rejected.

Verified end to end in the browser with two isolated contexts: device A wrote, device B read it, device B edited, device A saw the edit on focus without reloading, and a stale write from device A was rejected with device B's data intact.

### Local development and testing against plain PostgreSQL

The production driver (`@neondatabase/serverless`) speaks HTTP to Neon and cannot target a local server. `server/src/db/index.ts` exposes `setDatabase(driver)`, a small injection seam accepting anything with the driver's shape (tagged template plus optional `transaction([...])`).

- `npm run server:dev:pg` runs the real API server against any local PostgreSQL via `scripts/dev-server-local-pg.mjs`.
- `npm run test:db` runs the integration suites; they are skipped unless `TEST_DATABASE_URL` is set.

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget npm run test:db
```

Each integration suite creates its own PostgreSQL schema (`test_repo`, `test_api`) so the files stay isolated when Vitest runs them in parallel.

---

# General Philosophy

Never duplicate information unless necessary.

Prefer relationships.

Prefer references.

Avoid storing derived values.

Instead:

Store raw data.

Calculate derived information when needed.

Examples:

Correct

Budget

↓

Transactions

↓

Remaining Budget (calculated)

Incorrect

Budget

Remaining Budget

Remaining Budget Percentage

Budget Health

(all stored)

These values should be calculated.

---

# Main Entities

Current entities include:

Transactions

Categories

Budget Approvals

Historical Snapshots

Recurring Expenses

Activities

Settings

Future entities may include:

Users

Accounts

Savings Goals

Investments

Tags

Attachments

Notifications

Exchange Rate Cache

Budgets (multiple)

Shared Budgets

Family Members

Bank Connections

---

# Entity Relationships

```

Budget

↓

Transactions

↓

Categories

↓

Recurring Expenses

↓

Historical Snapshots

↓

Analytics

```

Historical snapshots should always reference the data that existed at that moment.

---

# Transactions

A transaction should eventually support:

Unique ID

Amount

Currency

Category

Subcategory

Date

Time

Notes

Payment Source

Budget Source

Recurring Flag

Recurring Type

Historical Snapshot Reference

Created At

Updated At

Deleted Flag (optional future)

---

# Categories

Each category should support:

Name

Description

Icon

Colour

Parent Category

Display Order

Visibility

Archived Flag

Future categories should allow unlimited nesting.

Example

Transport

└── Fuel

└── Maintenance

└── Insurance

---

# Budget Approvals

The approval system exists because:

Suggested Budget

≠

Approved Budget

The user should always approve or modify an automatically calculated budget.

Never overwrite an approved budget automatically.

---

# Historical Snapshots

Snapshots represent history.

They should remain immutable.

Never regenerate old snapshots silently.

Historical information should never change because current settings changed.

Example

Changing today's category colour

must NOT modify

January 2025 historical snapshot.

---

# Activity Log

Activities should eventually record:

Transaction Created

Transaction Edited

Transaction Deleted

Budget Approved

Recurring Expense Created

Recurring Expense Modified

Category Added

Category Removed

Currency Changed

Settings Changed

Future:

Cloud Synchronized

Import Performed

Export Generated

Login

Logout

AI Recommendation Accepted

---

# Settings

Settings should eventually contain:

Currency

Theme

Language

Analytics Preferences

Ignore Non-Budget Spending

Notification Settings

Accessibility Options

Dashboard Layout

Chart Preferences

Future Sync Options

---

# Future Database Evolution

Possible future tables:

Users

Accounts

Savings Goals

Goals Progress

Receipts

Attachments

Tags

Notifications

AI Recommendations

Import Jobs

Export Jobs

Subscription Tracking

Widgets

The database should already be designed so these additions require minimal restructuring.

---

# Performance

As data grows:

Prefer indexed queries.

Avoid SELECT *.

Paginate large tables.

Cache expensive calculations.

Use database constraints whenever possible.

Prefer transactions for multi-step updates.

---

# Data Integrity

Financial information must always remain trustworthy.

Never:

Automatically delete data

Automatically merge transactions

Automatically modify historical months

Automatically change approved budgets

Always preserve user history.

---

# Migration Philosophy

Future migrations should:

Be reversible.

Be versioned.

Be documented.

Never require manual editing of production data.

Prefer small migrations over large breaking changes.

---

# Backup Strategy (Future)

Future cloud versions should support:

Automatic backups

Manual backups

Export to JSON

Export to CSV

Export to Excel

Import previous backups

Version history

Because financial information should never be easily lost.
