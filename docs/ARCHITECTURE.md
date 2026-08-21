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

### Synchronization model — compare-and-swap (revised 2026-08-15)

The snapshot is the unit of persistence, and `snapshots.revision` is the unit of concurrency.

```
Device A                       Server                      Device B
  read  → baseRevision = 7
  write (base 7)            →  stored 7 → accept, assign 8
                                                        ← read → base 8
                               stored 8 → reject base 7 with 409 + snapshot
  adopt server snapshot     ←
```

`PUT /api/snapshot` accepts a write only when the client's `baseRevision` — the revision it last read from the server — still equals the stored revision. The **server** then assigns the next revision.

The earlier design trusted a client-supplied `revision` and accepted anything higher than stored. That was unsafe: a device editing while offline keeps incrementing its own counter, so it could reconnect with a larger number and overwrite whatever the other device had done in the meantime. A client cannot game `baseRevision`, because a stale base is exactly what gets rejected.

`GET /api/snapshot/revision` is a cheap freshness probe, used on window focus so another device's change appears without a manual reload.

### Online, offline, and the difference between them

The server is authoritative whenever reachable. IndexedDB is an explicit offline cache, never a silent equal.

| State | Meaning |
| --- | --- |
| `saved` | In sync with the server |
| `saving` | A write is in flight |
| `offline` | Server unreachable; the change exists only on this device |
| `conflict` | The server holds data this device did not build on |
| `error` | The write failed for another reason |

The store exposes this as `syncState` and the header renders it. This matters more than it looks: the previous implementation caught API failures and fell through to IndexedDB, so a browser with a broken backend looked identical to a healthy one — and two browsers would each quietly accumulate their own private dataset while appearing to work. **"API unavailable" must never be presented as "saved".**

Hydration asks the server first and falls back to the local cache only when it cannot be reached, so a device never boots from a stale cache and then overwrites newer remote data.

### Database driver seam

`server/src/db/index.ts` exposes `setDatabase(driver)` alongside the default Neon client. Anything matching the driver shape — a tagged template plus optional `transaction([...])` — can be injected. This exists because the Neon serverless driver speaks HTTP to Neon and cannot target a local PostgreSQL server, which would otherwise make the backend impossible to run or test without a Neon account.

### Analytics layer

`src/domain/analytics.ts` holds every period-aware selector: period filtering, spending statistics, budget pacing and projection, category breakdown, period comparison, and trend windows. The Dashboard and the Analytics page are both presentation over this one module.

```
snapshot + settings → src/domain/analytics.ts → Dashboard
                                              → AnalyticsPanel
```

The rule is that no financial figure is computed inside a component. The two surfaces previously each had their own implementation, which is how the Dashboard came to ignore the global period selector while the Analytics page honoured it.

Presentation is layered on top:

```
src/domain/analytics.ts     selectors — totals, pacing, breakdowns, forecast, health
src/domain/funding.ts       who paid — the one place the budget/external rule exists
src/domain/schedule.ts      recurrence maths — real occurrences per calendar month
src/domain/payments.ts      when money leaves — payment cycles, separate from events
src/domain/dashboard.ts     which dashboard sections appear, and in what order
src/domain/report.ts        report model + printable HTML, from the same selectors
src/components/charts/      dependency-free SVG chart library
```

### Leaf modules for rules that must not be expressible twice

`funding.ts`, `schedule.ts`, `payments.ts` and `dashboard.ts` import nothing from the rest of the domain. That is the point: a rule with one definition cannot be honoured by one view and ignored by another.

### Accrual and payment are two different questions

`payments.ts` exists because the application had been answering one question where there are two.

- **What does this cost per month?** An accrual. It is what a budget compares commitments with, and it is what `calculations.ts` produces. A €60 annual subscription accrues €5 a month; a gym paid ten sessions at a time accrues whatever the month's sessions come to.
- **When does money actually leave?** A dated series. It is what a bank statement shows, and it is what `payments.ts` produces. The same subscription is one €60 charge on one day a year; the same gym is one €200 payment about every five weeks.

Conflating them is how "two sessions a week" becomes "two payments a week" and how "€60 a year" becomes "€60 a month". The two modules therefore never derive one figure from the other: `paymentsBetween()` returns `null` for every model it does not own, and the timeline falls back to the recurrence rule for those.

Consequences that follow from the split, and are load-bearing:

- Anything printing a monthly figure asks `isAveragedMonthly()` first, so an average is labelled as one.
- Neither model invents a date. With no renewal or start date to count from, the activity is reported as undated with its monthly average — never placed on a calendar at a guessed position.
- One-off schedule overrides act on the recurrence rule, so they do not apply to a payment cycle, and the UI hides the control rather than offering one that does nothing.

`funding.ts` is the clearest case. "Money somebody else paid does not count against your budget" used to be a *setting*, checked independently in `calculations.ts` and in `analytics.ts` — and `calculateYear` did not check it at all for `totalSpend` or `ytdTotal`, so those two figures disagreed with every other figure in the app. It is now one predicate that every budget selector filters through, and the setting is gone. A figure is either derived from `personalEntries(...)` or it is explicitly the full ledger and says so.

`src/components/charts/scale.tsx` holds the pure maths (`niceTicks`, path builders, `compactNumber`) with no React or DOM, so axis and tick behaviour is unit-testable on its own.

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
