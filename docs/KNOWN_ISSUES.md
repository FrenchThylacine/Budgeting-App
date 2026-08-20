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

## Multi-device synchronization — resolved 2026-08-16

Reported symptom: changes made in a normal window and a private window did not synchronize.

The conflict system was not the cause. The cause was that **an unreachable API was indistinguishable from a successful save**. Both `loadSnapshot` and `saveSnapshot` caught API errors and fell through to IndexedDB, so a browser with a broken or unconfigured backend behaved exactly like a healthy one while quietly building its own private dataset — and a private window has its own IndexedDB.

A second, subtler fault sat underneath: the concurrency guard trusted a client-supplied `revision` and accepted anything higher than stored. A device that edited while offline keeps incrementing its counter, so it could reconnect with a larger number and overwrite the other device's work.

Both are fixed. See `docs/ARCHITECTURE.md` for the model and `docs/API.md` for the protocol. The rule to preserve: **never let "API unavailable" be presented as "saved"**.

If synchronization ever appears broken again, check in this order:

1. `GET /api/health` — `503 degraded` means the server is up but `DATABASE_URL` is missing or wrong.
2. The sync badge in the header — `Offline` means this device is not reaching the API at all.
3. `GET /api/snapshot/revision` on both devices — if they differ and one shows `Offline`, it is a connectivity problem, not a merge problem.

## Verification status — 2026-08-15

Resolved since the previous entry (all verified against a live PostgreSQL server and a real browser session):

- Persistence, refresh durability, server-restart durability, and two-device read/write are verified. See `docs/DATABASE.md` for the five SQL-level defects this uncovered.
- Browser verification is complete for dark/light switching, the period selector, historical mode, analytics, and mobile layouts at 320–430 px plus landscape and tablet.
- Snapshot writes are targeted, transactional upserts.

Still open:

- **A production Vercel deployment has not been verified.** The build compiles and `api/[...path].ts` mounts the Express app, but no authenticated deployment has been run from this environment, so production routing and a production `DATABASE_URL` remain unconfirmed.
- **The Neon HTTP driver itself has not been exercised.** Integration coverage runs the identical SQL through node-postgres against real PostgreSQL. Neon's wire transport is therefore assumed, not proven. `sql.transaction([...])` in particular should be confirmed once a Neon instance is available.

## Historical editing — resolved 2026-08-15

Previously open as a product question; now decided and implemented as **allow with explicit consent and a full audit trail**.

A closed period stays read-only by default. The historical banner offers "Edit this period", which opens a consent dialog stating the consequences and requiring an explicit acknowledgement before unlocking. While unlocked:

- The banner switches to a loud danger state naming the period being edited.
- Every period-bound change is written to the audit trail with `historicalEdit: true` and the period label, and the History panel surfaces and filters them.
- Approved budgets remain immutable. The override unlocks *data*, never decision records, so Rule 6 is preserved and `recordBudgetApproval` deliberately checks the period directly rather than `isCurrentPeriodMutable()`.
- The unlock is session-only. It is never persisted, never travels to another device, and clears automatically as soon as the selected period changes.

Category `bucket` and `monthlyCap` remain blocked while viewing a historical period. Those are read live when reporting any period, so changing them restates closed periods wholesale rather than editing one period's data.

Still permissive by design: back-dating a transaction from the current period. Entering a receipt a few days late is normal, and blocking it would make late entry impossible now that the dedicated, audited path exists for rewriting a closed period.

## Resolved on 2026-08-21

Each of these was open in this file or in `implementation_plan.md` and is now closed. The detail is in the plan; this is the index so the same problem is not solved twice.

| Was | Now |
| --- | --- |
| Externally funded spending charged to the budget by default | Excluded unconditionally, `src/domain/funding.ts` |
| Typing in any editor moved focus to the first field | `EditorSheet`'s set-up effect depends on nothing |
| The wishlist editor was clipped inside the card it was opened from | One editor at the panel root |
| Wishlist totals summed across currencies without converting | Converted |
| A wishlist card's link was labelled with the brand and opened the seller | The label names the destination |
| Currency display list fixed in `CURRENCY_OPTIONS` | `trackedCurrencies`, with what may not be untracked enforced |
| No manual next-renewal date | `Activity.nextRenewalDate`, migration 012, display-only |
| No manual reports | Custom ranges, which refuse to state a budget they cannot know |
| `PATCH /snapshot/settings` spread the body unvalidated | Per-field whitelist, ten tests |
| `POST /snapshot/reset` reported success without doing anything | Removed |
| Seasonal presets implemented and reachable from nowhere | Seasons section in the Scenario Lab, created by capture |
| `YearRecord.monthlyNotes` had no action, no UI, and was never persisted | All three, migration 011 |
| `calculation.categoryTotals` computed and read by nothing | Removed |
| Four settings stored and read by nothing | One wired, three removed |
| Dashboard sections not selectable or reorderable | Seven sections, shown/hidden and reordered, stored with the budget |
| Every caption in the app below the contrast minimum | Measured palette; zero failures across ten tabs, both themes |

## Granular REST routes are not on the live write path — 2026-08-15

The client persists exclusively through `GET`/`PUT /api/snapshot` (see `src/store/budgetStore.ts`). The per-entity routes under `server/src/routes/` (spending, categories, activities, approvals) are fully implemented and validated but are not called by the UI. Their validation therefore protects nothing today; snapshot-level validation in `routes/snapshot.ts` is what guards the real path. Either wire the client to the granular routes or treat them as an external API surface — but do not assume their validation constrains the app.

**Partially addressed 2026-08-21.** `PATCH /snapshot/settings` is the one granular route a client could plausibly reach for, and it now validates per field. The rest remain documented surface with no live caller.

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
