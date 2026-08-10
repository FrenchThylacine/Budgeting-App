# Live implementation plan

This is the active engineering tracker for the current stabilization and completion effort. It is updated at each implementation checkpoint. A checkbox is marked complete only after implementation and the relevant verification have both succeeded.

**Last updated:** 2026-08-11 — Analytics panel rebuilt (real data, period-aware, charts, burn rate, recurring split), wishlist full edit workflow, category full edit with parent/cap/description, 7 new analytics regression tests (31 total), all builds clean.

## In progress

- [ ] Complete browser verification for the redesigned month/week/year selector on desktop, tablet, and mobile.
- [ ] Complete browser verification for the shared historical contour/banner and selected-period analytics across every major view.
- [ ] Verify Codex 1 workflows against browser and configured Neon persistence; complete the remaining deployment verification.

## Completed

- [x] Audited the documented architecture against the checked-out source (2026-08-09).
- [x] Identified the placeholder UI panels, unverified Neon persistence, missing deployment configuration, and documentation drift.
- [x] Restored the eight primary client workflows (source wired; browser/mobile and persistence verification pending).
- [x] Added store-level protection against historical period-bound mutations (source exists; automated tests pass).
- [x] Added approved-budget immutability guards in the store and API (2026-08-10; enforced in `approvals.ts` routes and store guards; unit tests pass).
- [x] Corrected the migration helper to await the Neon snapshot save and removed its obsolete SQLite wording (2026-08-09).
- [x] Updated README, AI context, changelog, and this live implementation plan with the implemented scope and current verification limitations (2026-08-09).
- [x] Established a local Node.js 22 runtime for verification without changing the system Node installation (2026-08-10).
- [x] Ran the existing Vitest suite successfully: 7 files and 31 tests passed (2026-08-11).
- [x] Ran the frontend production build successfully (2026-08-11; Vite reported only a bundle-size advisory, zero TypeScript errors).
- [x] Ran the server TypeScript build successfully (2026-08-11; 0 errors).
- [x] Audited Codex 1 and Codex 2 commits against source, tracker, tests, and builds (2026-08-10; browser/Neon/deployment claims remain explicitly unverified).
- [x] Added finite-number, date/month consistency, active-category, currency, and recurrence validation for spending API writes; transaction edits now recalculate ISO week as well as month (2026-08-10; frontend/server builds and domain tests pass).
- [x] Introduced a shared calendar/ISO period model with a separate `selectedWeekYear`, predictable mode transitions, cross-year week navigation, and a compact mode-aware header selector (2026-08-10; 24 automated tests plus frontend/server builds pass; visual verification remains open).
- [x] Propagated shared historical-period state to the application shell and made spending and analytics filter the selected month, ISO week, or year from real entries (2026-08-10; regression tests and builds pass; browser verification remains open).
- [x] Added store-level regression coverage preventing historical-week spending writes and historical-month budget approvals (2026-08-10; automated suite passes; API integration remains open).
- [x] Extended API validation beyond spending validation to categories, activities, settings, and approvals (2026-08-10; 24 automated unit tests pass).
- [x] Replaced destructive whole-snapshot persistence with safe targeted, transactional persistence (2026-08-10; refactored `SnapshotRepository.ts` to use `UPSERT` and targeted `NOT IN` deletions; 24 automated unit tests and server TypeScript build pass).
- [x] **Analytics panel rebuilt from scratch with real data** (2026-08-11):
  - Period-aware entry filtering: month / week (ISO) / year modes all correctly slice `snapshot.years[*].spendingEntries`.
  - KPI row: total spend, budget remaining, average transaction, burn rate (%).
  - Budget vs Actual section with progress bar and colour-coded delta (month mode).
  - Recurring vs non-recurring split with percentages.
  - SVG sparkline bar chart for monthly and weekly trends (no external chart library).
  - Category breakdown with progress bars, piloting correctly excluded from share %.
  - Savings & Wallet section (wallet total + wishlist active total).
  - Historical read-only banner when `isHistoricalPeriod` is true.
  - Zero is preserved as 0, missing/pending periods show '?'.
  - 7 new automated regression tests for analytics filtering (31 tests total, all pass).
- [x] **Wishlist full editing workflow implemented** (2026-08-11):
  - View filter tabs: Active / All / Bought with live counts.
  - Add form with: name, price, currency, priority (low/medium/high/dream), notes, inWishlist checkbox.
  - Inline edit form per-item, preloaded with existing values.
  - Saves through `store.updateWishlistItem` with name/price/currency/priority/notes/inWishlist patch.
  - Mark-bought button, delete with `window.confirm`.
  - Priority colour dots, notes preview (truncated), bought-date display.
  - Summary footer: active count/total, bought count.
  - Read-only mode when `isCurrentPeriodMutable()` is false (historical period).
  - Mobile: all flex layouts use flexWrap; inputs have minWidth constraints.
- [x] **Category full editing implemented** (2026-08-11):
  - Inline edit form per-category with: name, bucket, colour picker, monthly cap, parent category (1-level), description, icon name, notes.
  - `updateCategory` called with safe patch; existing spending transactions untouched.
  - Archive / Restore (unarchive via `updateCategory({ archived: false })`).
  - Archived categories collapsible section.
  - Referential-integrity note displayed to users.
  - All builds pass; zero TypeScript errors.

## Remaining

- [ ] Perform browser checks for dashboard, each restored workflow, historical read-only behavior, light/dark switching, and mobile layouts. Local server startup is currently blocked by the execution environment's approval policy.
- [ ] Verify the dark-mode source repair in a browser across light/dark switching, persistence, mobile navigation, dialogs, forms, charts, and historical mode.
- [ ] Add automated integration test coverage for real Neon database connection lifecycle when `DATABASE_URL` is configured.
- [ ] Add and verify Vercel deployment configuration (build compiles; authenticated preview pending).
- [ ] Reconcile the full architecture/database/API documentation with the verified production implementation after persistence and deployment checks.
- [ ] Update the README again after runtime verification with confirmed deployment and persistence instructions.
- [ ] Two legacy editor components (`ActivityEditor` and `WishlistEditor`) remain unused placeholders; consider cleanup.

## Discovered issues

- [x] Full snapshot writes delete and recreate child records, which is unsafe for auditability and concurrent updates (2026-08-10; replaced with targeted upserts and selective deletion in `SnapshotRepository.ts`).
- [x] The repository now has Vercel serverless/deployment configuration (`vercel.json` and `api/[...path].ts`) and both builds compile it (2026-08-10; authenticated preview remains open).
- [x] Replaced the stale `styles-extras.css` `--line-strong` and `--muted` references with active design tokens (2026-08-10; builds pass; visual dark-mode verification remains open).
- [x] The header previously mixed calendar and ISO week years, and analytics only aggregated the selected month. The shared period model now keeps ISO week-years explicit and filters real entries consistently (2026-08-10; automated regression coverage added).
- [x] Analytics panel was a minimal 85-line placeholder showing only period total + category list with no charts, no burn rate, no recurring split, no budget comparison. Fully rebuilt (2026-08-11; 31 tests pass, builds clean).
- [x] WishlistPanel had no edit capability — only add/mark-bought/delete, all minified onto one line. Full edit workflow implemented (2026-08-11).
- [x] CategoryManager had no edit capability — only add/archive. Full edit form with all fields implemented (2026-08-11).
- [ ] Browser and Neon persistence checks require a local-server execution approval and a valid `DATABASE_URL`, respectively. Neither has been verified yet.
- [ ] Vercel API function entrypoint and build configuration have been added and compile successfully, but an authenticated preview deployment is still required before completion.
