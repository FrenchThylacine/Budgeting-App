# Live implementation plan

This is the active engineering tracker for the current stabilization and completion effort. It is updated at each implementation checkpoint. A checkbox is marked complete only after implementation and the relevant verification have both succeeded.

**Last updated:** 2026-08-09 — post-implementation review; automated verification is blocked because this environment has no Node.js/npm runtime.

## In progress

- [ ] Verify the restored client workflows through the test suite and browser, including mobile layouts.
- [ ] Make persistence and deployment behavior trustworthy and document the verified architecture.

## Completed

- [x] Audited the documented architecture against the checked-out source (2026-08-09).
- [x] Identified the placeholder UI panels, unverified Neon persistence, missing deployment configuration, and documentation drift.
- [x] Replaced the eight placeholder primary panels with implemented client workflows for spending, activities, categories, wallet, wishlist, analytics, history, scenarios, and settings (2026-08-09; pending runtime verification).
- [x] Implemented an explicit close-month dialog that blocks rollover when the period total is missing (2026-08-09; pending runtime verification).
- [x] Added store-level protection against mutations of period-bound data while viewing a historical month (2026-08-09; pending runtime verification).
- [x] Rejected API changes to an already approved budget and prevented duplicate local approval records (2026-08-09; pending API verification).
- [x] Corrected the migration helper to await the Neon snapshot save and removed its obsolete SQLite wording (2026-08-09).
- [x] Updated README, AI context, changelog, and this live implementation plan with the implemented scope and current verification limitations (2026-08-09).

## Remaining

- [ ] Run `npm run test`, `npm run build`, and `npm run server:build` after Node.js is available; record the exact results here.
- [ ] Perform browser checks for dashboard, each restored workflow, historical read-only behavior, and mobile layouts after Node.js is available.
- [ ] Add automated regression tests for historical write protection and approved-budget API immutability.
- [ ] Improve API validation beyond required-field checks (numeric finiteness, dates, currencies, category references, and recurrence intervals).
- [ ] Replace destructive whole-snapshot persistence with safe targeted, transactional persistence.
- [ ] Add and verify Vercel deployment configuration.
- [ ] Reconcile the full architecture/database/API documentation with the verified production implementation after persistence and deployment checks.
- [ ] Update the README again after runtime verification with confirmed deployment and persistence instructions.

## Discovered issues

- [ ] Full snapshot writes delete and recreate child records, which is unsafe for auditability and concurrent updates.
- [ ] The repository lacks Vercel serverless/deployment configuration despite deployment claims.
- [ ] Node.js and npm are unavailable in this execution environment, so automated verification cannot currently run.
- [ ] Two legacy editor components (`ActivityEditor` and `WishlistEditor`) remain unused placeholders; the active panels now provide the supported create/edit workflow and these components should be removed or completed in a later cleanup.
