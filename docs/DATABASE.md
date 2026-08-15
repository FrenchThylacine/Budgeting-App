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

The persistence layer has been verified against a **live PostgreSQL server**, not only against mocks. 21 integration tests cover schema DDL, migrations, repository SQL, and the full HTTP API path; a browser session was additionally driven end to end (UI → API → PostgreSQL → UI) including a two-device read/write cycle.

The snapshot save flow performs targeted `ON CONFLICT (id) DO UPDATE SET ...` upserts for all top-level and nested child records (`activities`, `spending_entries`, `wishlist_items`, `wallet_entries`, `closed_months`, `categories`, `seasonal_presets`, `scenario_presets`). Only records removed from memory are deleted using targeted `NOT IN` queries. Whole-table deletions for year records have been eliminated.

### Defects found and fixed during live verification

These could not be observed with a mocked driver and were all failing in real PostgreSQL:

1. **Multi-statement DDL templates.** `initializeSchema` grouped `CREATE TABLE` and `CREATE INDEX` in single tagged templates. The Neon HTTP driver executes exactly one command per call, so schema creation failed. Every statement is now its own template.
2. **Integers bound to BOOLEAN columns.** Flags were written as `1`/`0`. PostgreSQL rejects an integer for `BOOLEAN` (SQLite tolerated it). All flags now bind real booleans.
3. **Year derived from a row-id suffix.** `parseSpendingEntry` recovered the year with `row.year_id.split("-").pop()`, but year ids embed `Date.now()`, so every loaded entry got a nonsensical year (falling back to a hard-coded `2026`). The year now comes from the `years` table.
4. **Non-atomic saves.** Each statement ran separately, so a mid-save failure left the database partly written. Writes are collected and executed through one `sql.transaction([...])` batch.
5. **Approvals and audit rows were subject to deletion passes.** Both are historical records and are now upsert-only.

### Concurrency and multi-device safety

`snapshots.revision` is a monotonically increasing counter (migration `003-add-snapshot-revision`). Each client commit increments it. `PUT /api/snapshot` rejects a write whose revision is not newer than the stored one with **409 Conflict**, returning the current server snapshot so the stale client rebases instead of silently overwriting a newer device's data. Verified in the browser: a stale device's write was rejected, the other device's data was preserved, and the user received an explanatory notice.

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
