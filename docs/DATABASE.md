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

## Current verification status — 2026-08-10

`SnapshotRepository` uses the Neon serverless driver and all repository calls are asynchronous. The build succeeds, but no `DATABASE_URL` is available in the current execution environment, so no claim is made that a create, refresh, server restart, update, and delete cycle has been verified against Neon.

The current snapshot save flow upserts top-level records but deletes and reinserts a year's nested activities, spending entries, wishlist items, wallet entries, and closed months. This is a known limitation: it can preserve the current snapshot but is not suitable as the long-term concurrent-write or audit-log strategy. It is tracked in `implementation_plan.md`.

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
