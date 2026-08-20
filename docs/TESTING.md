# TESTING.md

> Complete Quality Assurance guide for the Budgeting App.

---

# Philosophy

Financial software must prioritise correctness over speed.

A beautiful UI with incorrect financial calculations is unacceptable.

Every feature should be verified before merging.

Testing is not optional.

Testing is part of development.

---

# Regression Checklist

Run this checklist before every release.

## Last recorded automated run — 2026-08-21

- `npm test`: passed — **433 tests**.
- `npm run test:db` against local PostgreSQL 17: passed — **71 integration tests**.
- `npm run build` and `npm run server:build`: passed.

New suites this pass:

| Suite | Covers |
| --- | --- |
| `tests/external-funding.test.ts` | Rule 7, built on the specification's own worked example — €1,000 budget, €300 personal, €200 external, €700 remaining — asserted across pacing, burn rate, forecast, categories, comparisons, week/month/year, and the report |
| `tests/editor-typing.test.tsx` | The editor focus bug. Types "Amazon Flight Simulator Hardware" one character at a time and asserts focus and caret after each one |
| `tests/dashboard-widgets.test.ts` | Reconciling a stored dashboard arrangement against the sections that exist |
| additions to `tests/api-validation.test.ts` | Per-field validation of `PATCH /snapshot/settings` |
| additions to `tests/upcoming.test.ts` | The manual next-renewal date, including that it never changes a cost |
| additions to `tests/exchange-rates.test.ts` | Tracked currencies, and what may not be untracked |
| additions to `tests/report.test.ts` | Custom-range reports, and what they refuse to state |
| additions to `tests/db-integration.test.ts` | Round trips for `monthly_notes` and `next_renewal_date`, including malformed stored values |

### The first component test, and why there is only one

`tests/editor-typing.test.tsx` runs under jsdom (`// @vitest-environment jsdom` — no global config change, so every other suite stays in Node and stays fast). It exists because the bug it covers cost more time than any other in the project, and because a unit test could not have caught it: the defect was a React effect dependency, visible only when a component re-renders.

It was written against the *broken* code first and confirmed to fail. A regression test that has never failed is a guess.

### Multi-device concurrency

`tests/api-integration.test.ts` covers the cases that matter for two devices:

- the server assigns the revision, so a client claiming `revision: 9999` cannot set it;
- a write built on a stale base is rejected **even when its own revision is higher** — the offline-device case that could previously overwrite another device;
- two devices reading the same base: the first write wins, the second gets 409 with the current snapshot;
- after adopting the server revision, the loser's retry succeeds.

## Test layers

**Domain and store tests** (always run) cover period/ISO-week semantics, currency handling, analytics selectors, historical write guards, and repository SQL shape.

**Database integration** (`tests/db-integration.test.ts`) runs the real schema DDL, migrations, and `SnapshotRepository` against a live PostgreSQL server. Mocked-driver tests cannot catch multi-statement templates, integers bound to BOOLEAN columns, or broken `ON CONFLICT` targets — every one of which was failing in real PostgreSQL and passing against the mock.

**API integration** (`tests/api-integration.test.ts`) boots the real Express app and drives it over HTTP, exercising route → validation → service → repository → PostgreSQL, including the 409 conflict path and a simulated two-device exchange.

Both suites are skipped unless `TEST_DATABASE_URL` is set, so the default `npm test` stays fast and dependency-free.

### Running the database tests

```bash
# Any disposable PostgreSQL database works.
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget npm run test:db
```

The Neon serverless driver speaks HTTP to Neon and cannot target a local server, so the suites inject a node-postgres adapter through `setDatabase()` that presents the same interface (tagged template plus `transaction([...])`). The SQL under test is therefore identical to what production sends. Each suite creates its own PostgreSQL schema (`test_repo`, `test_api`) so parallel files do not collide.

### Running the app against local PostgreSQL

```bash
LOCAL_PG_URL=postgres://postgres@127.0.0.1:5432/budget npm run server:dev:pg   # real API on :3001
npm run dev                                                                    # Vite proxies /api to it
```

## What automated tests do not cover

- The Neon HTTP transport itself, notably `sql.transaction([...])`.
- Production Vercel routing and a production `DATABASE_URL`.
- Physically separate devices (two isolated browser contexts were used instead).
- Swipe gestures end to end. The maths is unit-tested (`tests/swipe.test.ts`); the pointer sequence is not.

Browser checks — theme switching, period navigation, historical mode, mobile widths from 320px, and both themes — were driven through Chrome DevTools this session and are recorded in `implementation_plan.md`. They are not yet automated; a Playwright suite is the obvious next step.

### Scripted browser checks worth repeating

Two of this session's checks were scripts run in the DevTools console rather than assertions in a file, and both are worth re-running after any change in their area. Neither needs a framework.

**Typing, in the real browser.** Set the value character by character through the native setter and dispatch `input`, asserting `document.activeElement`, `selectionStart` and node identity after each keystroke. This is what proved the editor fix against a real React render, rather than against jsdom's approximation of one.

**Contrast, everywhere.** Walk every text node on every tab, composite the translucent backgrounds behind it, compute the ratio against the computed font size and weight, and report anything under AA. The last run covered ten tabs in both themes and returned zero. Before it, twenty elements failed — including `--text-tertiary`, the token behind every caption in the app. **Do not eyeball a colour change**; this is how the failing value got in.

## General

☐ Application starts

☐ Backend starts

☐ Database connects

☐ No console errors

☐ No API errors

☐ Build succeeds

☐ Production build succeeds

☐ Deployment succeeds

---

# Budget

Verify:

☐ Budget can be created

☐ Budget can be edited

☐ Budget can be deleted

☐ Budget approvals still work

☐ Previous approvals remain accessible

☐ Historical budgets remain unchanged

☐ Suggested budget calculates correctly

☐ Rounding still works

Examples:

1234 → 1300

5601 → 5700

---

# Transactions

Test:

Create

Edit

Delete

Undo (future)

Duplicate (future)

Verify:

☐ Notes

☐ Date

☐ Category

☐ Amount

☐ Currency

☐ Payment Source

☐ Budget Source

☐ Recurrence

All changes should persist after refresh.

---

# Categories

Verify:

Create

Edit

Delete

Colour

Icon

Description

Subcategory

Sorting

Hierarchy

Changing category metadata should NOT modify historical snapshots.

---

# Recurring Expenses

Test:

Daily

Weekly

Monthly

Quarterly

Yearly

Future custom recurrence

Verify:

Correct dates

Correct totals

Correct dashboard values

Correct forecasts

Correct suggestions

---

# Currency Conversion

Verify:

Selected currency changes display only.

Stored values remain unchanged.

EUR equivalent always displays.

No duplicate EUR.

Rounding remains correct.

Historical values remain stable.

---

# Historical Mode

Verify:

Month navigation

Week navigation

Year navigation

Historical banner

Historical outline

Historical calculations

Historical snapshots

Historical approvals

Historical analytics

Historical mode must NEVER modify data.

---

# Dashboard

Verify:

Budget Remaining

Monthly Spending

Budget Progress

Recurring Total

Forecast

Burn Rate

Savings

Health Score

Category Graphs

Trend Graphs

Historical Comparison

Everything updates correctly.

---

# Analytics

Verify:

Charts

Filters

Comparisons

Forecasts

Category breakdown

Monthly trend

Weekly trend

Yearly trend

No incorrect percentages.

---

# Mobile

Test:

iPhone

Android

Small phone

Tablet

Landscape

Portrait

Verify:

No overflow

No clipping

No tiny buttons

No hidden dialogs

Comfortable spacing

Large touch targets

---

# Desktop

Verify:

1080p

1440p

4K

Ultra-wide

Window resizing

---

# Accessibility

Verify:

Keyboard navigation

Tab order

Focus indicators

ARIA labels

Screen reader compatibility

Reduced motion

Colour contrast

---

# Performance

Check:

Dashboard load time

Navigation speed

Chart rendering

Search speed

Filtering speed

Database response

Bundle size

Memory usage

---

# Deployment

Verify:

GitHub repository

Vercel deployment

Environment variables

Database connection

HTTPS

Production API

---

# Future Automated Testing

Recommended:

Vitest

Playwright

React Testing Library

API integration tests

Database tests

Performance tests

Accessibility tests

Visual regression tests

---

# Release Checklist

Before every release:

✔ Build

✔ Test

✔ Deploy Preview

✔ Verify Database

✔ Verify Dashboard

✔ Verify Mobile

✔ Verify Historical Data

✔ Verify Analytics

✔ Verify Budget

✔ Merge

✔ Deploy

Never release without verification.
