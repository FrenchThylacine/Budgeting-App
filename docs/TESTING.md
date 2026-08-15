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

## Last recorded automated run — 2026-08-15

- `npm run test`: passed — 10 files, 81 tests.
- `npm run build`: passed — Vite emitted a bundle-size advisory only.
- `npm run server:build`: passed.
- `npm run test:db` against local PostgreSQL 17: passed — 21 integration tests.

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

Browser checks — theme switching, period navigation, historical mode, mobile widths from 320 px, landscape, and tablet — were performed manually this session and are recorded in `implementation_plan.md`. They are not yet automated; a Playwright suite is the obvious next step.

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
