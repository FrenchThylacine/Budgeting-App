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

## Last recorded automated run — 2026-08-10

- `npm run test`: passed — 4 files, 19 tests, including ISO-week boundaries, week-53 navigation, mode transitions, historical-week detection, and store-level historical write guards.
- `npm run build`: passed — Vite emitted a bundle-size warning only.
- `npm run server:build`: passed.

These commands validate compilation and current domain tests. They do not substitute for browser, mobile, Vercel, or Neon persistence checks, which remain open in `implementation_plan.md`.

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
