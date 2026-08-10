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

## Verified implementation status — 2026-08-10

The current client persists a complete `BudgetSnapshot` through `src/store/budgetStore.ts`: it attempts the REST API first and also writes IndexedDB as an offline fallback. The Express application is now reusable in `server/src/app.ts`; `server/src/index.ts` is only the local listener, and `api/[...path].ts` exports the same app for Vercel Functions. Frontend and server TypeScript builds pass.

The repository still uses delete-and-reinsert writes for nested snapshot records. That is functional only after a Neon-backed persistence test is run, and it remains a tracked concurrency/auditability risk rather than a completed transactional design.

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
