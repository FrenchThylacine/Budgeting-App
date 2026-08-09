# Live implementation plan

This is the active engineering tracker for the current stabilization and completion effort. A checkbox is marked complete only after implementation and the relevant verification have both succeeded.

## In progress

- [ ] Restore the core product workflows that were replaced by placeholder tabs.
- [ ] Protect historical periods and approved budgets from accidental mutation.
- [ ] Make persistence and deployment behavior trustworthy and document the verified architecture.

## Completed

- [x] Audited the documented architecture against the checked-out source (2026-08-09).
- [x] Identified the placeholder UI panels, unverified Neon persistence, missing deployment configuration, and documentation drift.

## Remaining

- [ ] Implement transactions/spending creation, editing, deletion, and filtering.
- [ ] Implement recurring activities, categories, settings, history, analytics, wishlist, wallet, and scenario workflows.
- [ ] Add targeted API validation and enforce immutable approved budgets.
- [ ] Replace destructive whole-snapshot persistence with safe targeted, transactional persistence.
- [ ] Add automated API/persistence and UI regression tests.
- [ ] Add and verify Vercel deployment configuration.
- [ ] Reconcile README and project documentation with the verified application behavior.
- [ ] Install or provide Node.js in the execution environment, then run test, frontend build, server build, and browser/mobile verification.

## Discovered issues

- [ ] Eight primary navigation panels currently render intentional placeholder empty states.
- [ ] Historical mode is visually marked read-only but store mutations are not blocked.
- [ ] Full snapshot writes delete and recreate child records, which is unsafe for auditability and concurrent updates.
- [ ] Existing approved budgets can be modified through the approval PATCH endpoint.
- [ ] Current migration-script text still references SQLite after the Neon migration.
- [ ] The repository lacks Vercel serverless/deployment configuration despite deployment claims.
- [ ] Node.js and npm are unavailable in this execution environment, so automated verification cannot currently run.
