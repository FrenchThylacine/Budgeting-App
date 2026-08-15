# KNOWN_ISSUES.md

> Living document tracking bugs, technical debt, UX inconsistencies and future engineering work.

---

# Purpose

This file is NOT simply a bug tracker.

It is a complete overview of:

- Current issues
- Technical debt
- UI inconsistencies
- Architecture improvements
- Performance opportunities
- Future refactors

Before starting work, review this file.

Do not recreate solved problems.

Do not solve the same problem twice.

---

# Critical Issues

These issues have the highest priority.

## Verification status — 2026-08-15

Resolved since the previous entry (all verified against a live PostgreSQL server and a real browser session):

- Persistence, refresh durability, server-restart durability, and two-device read/write are verified. See `docs/DATABASE.md` for the five SQL-level defects this uncovered.
- Browser verification is complete for dark/light switching, the period selector, historical mode, analytics, and mobile layouts at 320–430 px plus landscape and tablet.
- Snapshot writes are targeted, transactional upserts.

Still open:

- **A production Vercel deployment has not been verified.** The build compiles and `api/[...path].ts` mounts the Express app, but no authenticated deployment has been run from this environment, so production routing and a production `DATABASE_URL` remain unconfirmed.
- **The Neon HTTP driver itself has not been exercised.** Integration coverage runs the identical SQL through node-postgres against real PostgreSQL. Neon's wire transport is therefore assumed, not proven. `sql.transaction([...])` in particular should be confirmed once a Neon instance is available.

## Back-dating and historical protection — 2026-08-15

`isCurrentPeriodMutable()` derives from the *selected view period*, not from the date on the record being written. While viewing the current month a user can still enter or re-date a transaction into a past month, which changes that month's reported totals.

This is deliberately left permissive: entering a receipt a few days late is a normal, legitimate action, and because historical periods are read-only, blocking back-dated entry outright would make late entry impossible. The product decision — warn, block, or allow with an audit note — is open. Category `bucket` and `monthlyCap` are already blocked while a historical period is selected, since those retroactively rewrite reported history rather than adding to it.

## Granular REST routes are not on the live write path — 2026-08-15

The client persists exclusively through `GET`/`PUT /api/snapshot` (see `src/store/budgetStore.ts`). The per-entity routes under `server/src/routes/` (spending, categories, activities, approvals) are fully implemented and validated but are not called by the UI. Their validation therefore protects nothing today; snapshot-level validation in `routes/snapshot.ts` is what guards the real path. Either wire the client to the granular routes or treat them as an external API surface — but do not assume their validation constrains the app.

## Financial calculations

Nothing should ever compromise:

Budget calculations

Recurring expenses

Currency conversion

Historical snapshots

Budget approvals

These systems must remain mathematically correct.

---

## Historical Data

Historical periods are immutable.

Potential risks:

• Accidentally recalculating old months

• Updating historical snapshots

• Replacing missing values with zero

• Modifying approved budgets

Never perform these operations automatically.

---

## Mobile Experience

Current goals:

Improve spacing

Improve navigation

Improve touch targets

Improve responsiveness

Improve charts

Improve dialogs

Improve sidebar

Improve forms

Improve transaction editor

The mobile experience should eventually feel native.

---

## Dashboard

Future improvements:

Better KPI hierarchy

Better information density

Improved widgets

Forecast section

Savings section

Budget health

Financial score

Upcoming recurring expenses

Category insights

Historical comparisons

Interactive charts

---

# Technical Debt

The following areas should be improved over time.

## Components

Possible issues:

Large components

Duplicated layouts

Repeated UI

Inconsistent styling

Improve by:

Splitting components

Reusing layouts

Extracting reusable primitives

---

## Styling

Potential improvements:

Remove duplicated CSS

Improve spacing consistency

Reduce colour inconsistencies

Create reusable variables

Introduce design tokens

---

## State Management

Review:

Duplicated state

Derived state

Unnecessary re-renders

Large state updates

Possible future improvements:

Selectors

Memoization

Context cleanup

Store modularisation

---

## Backend

Future improvements:

Better validation

Centralised error handling

Request logging

Better typing

Improved middleware

Versioned API

---

## Database

Future improvements:

Indexes

Optimised queries

Soft deletes

Migration tooling

Backup strategy

Audit trail

Relationship improvements

---

# UI Inconsistencies

Review periodically.

Examples:

Different card spacing

Different button heights

Inconsistent typography

Inconsistent animations

Different border radius

Misaligned icons

Mixed colours

Duplicate dialogs

Different empty states

These should gradually disappear.

---

# Performance

Monitor:

Large bundle size

Slow charts

Slow dashboard

Repeated API calls

Large renders

Repeated calculations

Future optimisation should focus on:

Memoization

Lazy loading

Virtualisation

Efficient queries

Caching

---

# Accessibility

Future improvements:

Keyboard navigation

Screen readers

ARIA labels

Reduced motion

High contrast

Large touch targets

Focus indicators

Accessible charts

---

# Missing Features

Current roadmap includes:

Savings goals

Investments

Accounts

Authentication

Cloud sync

Receipt OCR

AI assistant

Notifications

Widgets

Desktop application

Mobile application

Import/export

Advanced search

These are expected future additions.

---

# Code Quality

Always improve:

Naming

Consistency

Documentation

Comments

Tests

Folder structure

Type safety

Avoid introducing new technical debt.

---

# Bugs

When discovering a bug:

Describe it.

Document reproduction steps.

Document expected behaviour.

Document actual behaviour.

Document proposed solution.

Do not simply write:

"Fixed bug."

---

# Engineering Philosophy

Every commit should leave the project in a slightly better state than before.

Small continuous improvements produce excellent software.
