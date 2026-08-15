# ARCHITECTURE.md

This document explains how the application is organised.

---

# High-Level Architecture

The project follows a layered architecture.

```

User

↓

React UI

↓

Components

↓

Global Store

↓

Services

↓

REST API

↓

Express

↓

Business Services

↓

Repositories

↓

Neon PostgreSQL

```

Each layer has a single responsibility.

## Verified implementation status — 2026-08-15

The client persists a complete `BudgetSnapshot` through `src/store/budgetStore.ts`: it writes to the REST API and also to IndexedDB as an offline fallback. The Express application lives in `server/src/app.ts`; `server/src/index.ts` is only the local listener, and `api/[...path].ts` exports the same app for Vercel Functions. Both builds pass, the compiled server boots, and the whole path has been exercised against a live PostgreSQL database from a real browser session.

`SnapshotRepository` performs targeted `ON CONFLICT (id) DO UPDATE SET ...` upserts with selective deletion of removed ids, and executes every write for one save inside a single transaction batch.

### Synchronization model

The snapshot is the unit of persistence, and `snapshots.revision` is the unit of concurrency.

```
Device A                    Server                     Device B
  commit → revision N+1  →  stored if N+1 > stored
                            else 409 + current snapshot
  adopt server snapshot  ←
```

Each client commit increments `revision`. `PUT /api/snapshot` accepts a write only when its revision is newer than the stored one; otherwise it returns **409** with the current server snapshot, and the client adopts that snapshot and asks the user to re-apply their change. This is last-writer-wins guarded by a staleness check — deliberately simpler than field-level merging, and sufficient because a snapshot write is whole-document.

Hydration order matters: the store loads from the API first and falls back to IndexedDB only when the API is unreachable, so a stale local cache can never win over server data.

### Database driver seam

`server/src/db/index.ts` exposes `setDatabase(driver)` alongside the default Neon client. Anything matching the driver shape — a tagged template plus optional `transaction([...])` — can be injected. This exists because the Neon serverless driver speaks HTTP to Neon and cannot target a local PostgreSQL server, which would otherwise make the backend impossible to run or test without a Neon account. Integration tests and `scripts/dev-server-local-pg.mjs` use it with a node-postgres adapter.

### Analytics layer

`src/domain/analytics.ts` holds every period-aware selector: period filtering, spending statistics, budget pacing and projection, category breakdown, period comparison, and trend windows. The Dashboard and the Analytics page are both presentation over this one module.

```
snapshot + settings → src/domain/analytics.ts → Dashboard
                                              → AnalyticsPanel
```

The rule is that no financial figure is computed inside a component. The two surfaces previously each had their own implementation, which is how the Dashboard came to ignore the global period selector while the Analytics page honoured it.

---

# Frontend

Responsibilities:

Display information.

Collect user input.

Render analytics.

Handle routing.

Display dialogs.

Display charts.

Handle responsive layouts.

The frontend should remain mostly presentation logic.

Avoid placing business calculations inside components whenever possible.

---

# Components

Components should be:

Small

Reusable

Composable

Well named

Focused

Each component should ideally have one responsibility.

Avoid giant components.

---

# Store

The global store is responsible for:

Application state

Current period

Selected currency

Settings

Transactions

Categories

Dashboard state

Historical navigation

The store should become the single source of truth for client state.

Avoid duplicated state.

### Period state

`Settings` owns one global period selection. Calendar views use `selectedYear` and `selectedMonth`; weekly views use `selectedWeek` together with `selectedWeekYear`, because ISO weeks can cross calendar-year records. `src/domain/periods.ts` is the shared source for mode transitions, navigation, labels, and historical comparisons. Components must not reimplement period arithmetic or infer an ISO year from a calendar record.

The application shell derives historical mode from this state and supplies the banner/contour once. Spending and analytics query the same selected period; weekly queries may read entries from both calendar-year records at a New Year boundary.

---

# Services

Services should contain business logic.

Examples:

Budget calculations

Analytics

Forecasts

Recurring expense handling

Currency conversion

Historical processing

UI components should call services instead of implementing calculations directly.

---

# Backend

The backend exposes REST endpoints.

Responsibilities:

Validation

Persistence

Business rules

Repository access

Future authentication

Future synchronization

Business logic should remain on the backend whenever appropriate.

---

# Repository Layer

Repositories communicate directly with the database.

Repositories should:

Create

Read

Update

Delete

Search

Nothing more.

Avoid placing business logic inside repositories.

---

# Database

Neon PostgreSQL is the source of truth.

The database should remain authoritative.

Avoid storing duplicate information whenever possible.

Future migrations should remain backwards compatible.

---

# Historical Snapshots

Historical snapshots are one of the project's defining features.

Snapshots represent financial history.

They should never be regenerated unless explicitly requested.

Historical months should remain immutable.

---

# Budget Approvals

Budget approvals exist for a reason.

The application should distinguish between:

Suggested budget

Approved budget

Historical budget

These concepts should never be merged.

---

# Recurring Expenses

Recurring expenses are calculated separately from one-time expenses.

Future recurrence types may include:

Daily

Weekly

Monthly

Quarterly

Yearly

Custom

Architecture should remain extensible.

---

# Currency Conversion

Internally, financial calculations should remain consistent.

Display currency is presentation.

Stored values remain stable.

Avoid repeated conversions.

Convert once.

Display.

---

# Activity Log

The activity log should eventually capture:

Transaction creation

Budget approval

Category edits

Recurring changes

Settings modifications

Future cloud synchronization events

The log should become an audit trail.

---

# UI Architecture

The interface should eventually follow a proper design system.

Pages

↓

Layouts

↓

Sections

↓

Cards

↓

Components

↓

Primitive UI elements

Avoid duplicated UI.

Reuse existing components whenever possible.

---

# Performance

As the project grows:

Reduce unnecessary renders.

Reduce duplicated queries.

Cache expensive calculations.

Memoize derived values.

Lazy load large pages.

Keep bundle size reasonable.

---

# Future Architecture

Future modules should integrate naturally.

Possible additions:

Authentication

Cloud Sync

Notifications

Savings Goals

Accounts

Investments

AI Assistant

Receipt OCR

Import/Export

The architecture should already anticipate these possibilities.

---

# Engineering Philosophy

When making changes:

Understand the system first.

Refactor carefully.

Keep code readable.

Prefer consistency.

Avoid clever solutions that reduce maintainability.

Future developers—including AI assistants—should be able to understand the project quickly.

The goal is not simply to write working code.

The goal is to build software that remains understandable, extensible, and reliable for years.
