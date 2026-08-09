# Live implementation plan

This is the active engineering tracker for the current stabilization and completion effort. It is updated at each implementation checkpoint. A checkbox is marked complete only after implementation and the relevant verification have both succeeded.

**Last updated:** 2026-08-10 — Codex 2 audit underway. This is the repository’s only live engineering tracker.

## In progress

- [ ] Audit Codex 1 implementation claims in the browser and against a configured Neon database.
- [ ] Diagnose and repair the dark-mode system across desktop and mobile.
- [ ] Harden persistence, API validation, and deployment configuration; then reconcile all project guides with verified behavior.

## Completed

- [x] Audited the documented architecture against the checked-out source (2026-08-09).
- [x] Identified the placeholder UI panels, unverified Neon persistence, missing deployment configuration, and documentation drift.
- [ ] Restored the eight primary client workflows (source is wired; browser/mobile and persistence verification pending).
- [ ] Implemented the explicit close-month dialog (source is wired; runtime verification pending).
- [ ] Added store-level protection against historical period-bound mutations (source exists; browser and persistence verification pending).
- [ ] Added approved-budget immutability guards in the store and API (source exists; API persistence verification pending).
- [x] Corrected the migration helper to await the Neon snapshot save and removed its obsolete SQLite wording (2026-08-09).
- [x] Updated README, AI context, changelog, and this live implementation plan with the implemented scope and current verification limitations (2026-08-09).
- [x] Established a local Node.js 22 runtime for verification without changing the system Node installation (2026-08-10).
- [x] Ran the existing Vitest suite successfully: 2 files and 12 tests passed (2026-08-10).
- [x] Ran the frontend production build successfully (2026-08-10; Vite reported only a bundle-size warning).
- [x] Ran the server TypeScript build successfully (2026-08-10).

## Remaining

- [ ] Perform browser checks for dashboard, each restored workflow, historical read-only behavior, light/dark switching, and mobile layouts. Local server startup is currently blocked by the execution environment’s approval policy.
- [ ] Add automated regression tests for historical write protection and approved-budget API immutability.
- [ ] Extend API validation beyond the completed spending validation to categories, activities, settings, and approvals (including category-reference checks and recurrence intervals).
- [ ] Replace destructive whole-snapshot persistence with safe targeted, transactional persistence.
- [ ] Add and verify Vercel deployment configuration.
- [ ] Reconcile the full architecture/database/API documentation with the verified production implementation after persistence and deployment checks.
- [ ] Update the README again after runtime verification with confirmed deployment and persistence instructions.

## Discovered issues

- [ ] Full snapshot writes delete and recreate child records, which is unsafe for auditability and concurrent updates.
- [ ] The repository lacks Vercel serverless/deployment configuration despite deployment claims.
- [ ] `styles-extras.css` uses legacy tokens such as `--line-strong` and `--muted` that are not defined by the active theme token set; this is a likely dark-mode inconsistency.
- [ ] Browser and Neon persistence checks require a local-server execution approval and a valid `DATABASE_URL`, respectively. Neither has been verified yet.
- [ ] Two legacy editor components (`ActivityEditor` and `WishlistEditor`) remain unused placeholders; the active panels now provide the supported create/edit workflow and these components should be removed or completed in a later cleanup.
- [ ] Dark-mode root cause has been addressed in source by moving theme tokens to `html.dark`, but desktop/mobile browser verification remains required before completion.
- [ ] Vercel API function entrypoint and build configuration have been added and compile successfully, but an authenticated preview deployment is still required before completion.
- [x] Added finite-number, date/month consistency, active-category, currency, and recurrence validation for spending API writes; transaction edits now recalculate ISO week as well as month (2026-08-10; frontend/server builds and domain tests pass).
