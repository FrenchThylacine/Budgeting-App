# Live implementation plan

This is the active engineering tracker for the current stabilization and completion effort. It is updated at each implementation checkpoint. A checkbox is marked complete only after implementation and the relevant verification have both succeeded.

**Last updated:** 2026-08-10 — ISO period model, historical state, analytics filtering, and regression tests are implemented and build-verified; browser, Neon, and deployment verification remain open. This is the repository’s only live engineering tracker.

## In progress

- [ ] Complete browser verification for the redesigned month/week/year selector on desktop, tablet, and mobile.
- [ ] Complete browser verification for the shared historical contour/banner and selected-period analytics across every major view.
- [ ] Verify Codex 1 workflows against browser and configured Neon persistence; complete the remaining deployment and API hardening work.

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
- [x] Audited Codex 1 and Codex 2 commits against source, tracker, tests, and builds (2026-08-10; browser/Neon/deployment claims remain explicitly unverified).
- [x] Added finite-number, date/month consistency, active-category, currency, and recurrence validation for spending API writes; transaction edits now recalculate ISO week as well as month (2026-08-10; frontend/server builds and domain tests pass).
- [x] Introduced a shared calendar/ISO period model with a separate `selectedWeekYear`, predictable mode transitions, cross-year week navigation, and a compact mode-aware header selector (2026-08-10; 19 automated tests plus frontend/server builds pass; visual verification remains open).
- [x] Propagated shared historical-period state to the application shell and made spending and analytics filter the selected month, ISO week, or year from real entries (2026-08-10; regression tests and builds pass; browser verification remains open).
- [x] Added store-level regression coverage preventing historical-week spending writes and historical-month budget approvals (2026-08-10; automated suite passes; API integration remains open).

## Remaining

- [ ] Perform browser checks for dashboard, each restored workflow, historical read-only behavior, light/dark switching, and mobile layouts. Local server startup is currently blocked by the execution environment’s approval policy.
- [ ] Verify the dark-mode source repair in a browser across light/dark switching, persistence, mobile navigation, dialogs, forms, charts, and historical mode.
- [ ] Add automated regression coverage for approved-budget API immutability; store-level historical write protection is covered, but API persistence still needs an integration test.
- [ ] Extend API validation beyond the completed spending validation to categories, activities, settings, and approvals (including category-reference checks and recurrence intervals).
- [ ] Replace destructive whole-snapshot persistence with safe targeted, transactional persistence.
- [ ] Add and verify Vercel deployment configuration.
- [ ] Reconcile the full architecture/database/API documentation with the verified production implementation after persistence and deployment checks.
- [ ] Update the README again after runtime verification with confirmed deployment and persistence instructions.

## Discovered issues

- [ ] Full snapshot writes delete and recreate child records, which is unsafe for auditability and concurrent updates.
- [x] The repository now has Vercel serverless/deployment configuration (`vercel.json` and `api/[...path].ts`) and both builds compile it (2026-08-10; authenticated preview remains open).
- [x] Replaced the stale `styles-extras.css` `--line-strong` and `--muted` references with active design tokens (2026-08-10; builds pass; visual dark-mode verification remains open).
- [ ] Browser and Neon persistence checks require a local-server execution approval and a valid `DATABASE_URL`, respectively. Neither has been verified yet.
- [ ] Two legacy editor components (`ActivityEditor` and `WishlistEditor`) remain unused placeholders; the active panels now provide the supported create/edit workflow and these components should be removed or completed in a later cleanup.
- [ ] Vercel API function entrypoint and build configuration have been added and compile successfully, but an authenticated preview deployment is still required before completion.
- [x] The header previously mixed calendar and ISO week years, and analytics only aggregated the selected month. The shared period model now keeps ISO week-years explicit and filters real entries consistently (2026-08-10; automated regression coverage added).
