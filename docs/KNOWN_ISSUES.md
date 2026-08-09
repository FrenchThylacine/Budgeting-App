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

## Verification gaps — 2026-08-10

- Neon persistence is not yet exercised in this environment because `DATABASE_URL` is unavailable. Do not claim refresh or restart durability until a live database cycle has passed.
- Browser verification is pending because local dev-server execution requires an environment approval that is currently unavailable. This includes the final dark-mode and mobile checks.
- Vercel configuration and a catch-all API function now exist, but an authenticated preview deployment remains required.
- Snapshot writes delete and reinsert nested year records. This is a concurrency and auditability risk that should be replaced with targeted transactional writes.

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
