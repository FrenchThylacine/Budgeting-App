# Live implementation plan

This is the active engineering tracker. A checkbox is marked complete only after implementation **and** the relevant verification have both succeeded. "Code exists" is never sufficient.

**Last updated:** 2026-08-15 — Consent-gated historical editing with full audit trail, History panel rebuilt (approvals never rendered — fixed), category caps made functional (were stored but unused by any calculation), wallet balances and settings coverage restored, Ctrl+Z no longer breaks typing. Earlier the same day: persistence verified against real PostgreSQL (5 SQL defects fixed), multi-device conflict guard, analytics unified behind shared selectors, mobile overflow and unreachable-section navigation fixed. 94 tests, both builds clean.

## How this session verified things

Previous sessions could not reach a database or a browser, so many items were carried as "source exists, unverified". This session established both:

- **Real PostgreSQL.** A local PostgreSQL 17 instance was used. The Neon serverless driver speaks HTTP to Neon only, so `setDatabase()` (a new injection seam) plugs in a node-postgres adapter exposing the same interface. The SQL under test is byte-for-byte what production sends.
- **Real browser.** Chrome DevTools drove the running app: adding and editing transactions, switching periods and themes, emulating 320/375/834/844 px viewports, and running two isolated browser contexts as two devices.

Anything that could not be verified this way is listed under *Not verified* below and is left unchecked.

## In progress

- [ ] Verify a production Vercel deployment (build compiles and `api/[...path].ts` mounts the Express app, but no authenticated deploy has been run from this environment).
- [ ] Exercise the Neon HTTP driver itself, in particular `sql.transaction([...])`. Integration tests prove the SQL against real PostgreSQL; Neon's transport is assumed, not proven.

## Completed — historical editing and product gaps (2026-08-15, later)

### Editing a closed period (product decision: allow with consent + audit)

- [x] Consent dialog stating consequences, with the confirm button disabled until explicitly acknowledged (2026-08-15; browser-verified, including at 375 px).
- [x] Danger-state banner naming the unlocked period, with one-click relock (2026-08-15; browser-verified).
- [x] Every period-bound change flagged in the audit trail with the period it rewrote (2026-08-15; verified in the browser and by test).
- [x] Approved budgets remain immutable while the override is active — it unlocks data, never decision records (2026-08-15; regression test).
- [x] Override is session-only and clears automatically when the period changes (2026-08-15; verified in the browser: navigating away relocked, and returning stayed locked).
- [x] Audit flags persist through PostgreSQL via migration `004-add-audit-historical-edit` (2026-08-15; integration-tested).

### History panel rebuilt

- [x] **Fixed: budget approvals never rendered.** `{approvals.length === 0 && <EmptyState/>}` had no else branch, so approvals were invisible whenever they existed (2026-08-15).
- [x] Audit trail surfaced for the first time — the store keeps 300 entries and exactly one was visible anywhere in the app (2026-08-15).
- [x] Month close records surfaced (status, total, delta, rollover) (2026-08-15).
- [x] Type filters plus a dedicated historical-edits filter and count banner (2026-08-15; browser-verified).

### Category caps made functional

- [x] `monthlyCap` was stored and editable but read by no calculation — setting a cap did nothing. Cap usage, headroom, and breach detection added to the shared analytics selectors (2026-08-15; 6 regression tests).
- [x] Analytics shows spend against cap with colour-coded progress and an over-cap badge (2026-08-15; browser-verified: €55 against a €20 cap reported €35 over).
- [x] Dashboard breach alert naming each category and the overage (2026-08-15; browser-verified).
- [x] Caps apply in month mode only, so a year's spend cannot report a false breach against a monthly cap (2026-08-15; regression test).
- [x] A cap of 0 is honoured as a real limit rather than treated as unset (2026-08-15; regression test).

### Wallet and settings

- [x] Wallet panel now shows balances (wallet, personal, rollover, opening) — previously computed but displayed only on other pages (2026-08-15).
- [x] Wallet entry type is selectable (was hardcoded to `personal`), with notes, inline editing via the previously-uncalled `updateWalletEntry`, month names, and base-currency equivalents (2026-08-15).
- [x] Settings expanded from 5 to 12 fields, including `monthlyBudgetCurrency` — the budget amount was being interpreted in a currency the user could neither see nor change (2026-08-15).
- [x] Exchange rates are editable in the UI; previously they could only be changed by importing a spreadsheet through a UI that does not exist (2026-08-15).

### Bug fixes

- [x] Ctrl+Z called `preventDefault()` and did nothing, disabling native undo in every text field while the header advertised the shortcut. Now performs undo/redo and stays out of the way while typing (2026-08-15).
- [x] Corrected a stale code comment claiming calculations read `monthlyCap` — they did not until caps were implemented (2026-08-15).

## Completed this session (2026-08-15)

### Persistence — verified against a live database

- [x] Ran the repository and API against real PostgreSQL and fixed the five defects it exposed (2026-08-15; 21 integration tests pass):
  - [x] Multi-statement DDL templates split into one statement each — the Neon HTTP driver runs exactly one command per call, so schema creation had been failing outright.
  - [x] Boolean columns bound as real booleans instead of `1`/`0`, which PostgreSQL rejects.
  - [x] Entry `year` read from the `years` table instead of parsing the year-row id suffix, which embeds `Date.now()` and produced garbage years falling back to a hard-coded `2026`.
  - [x] All snapshot writes executed in one `sql.transaction([...])` batch; verified by a test that forces a mid-batch foreign-key violation and asserts nothing from the batch was committed.
  - [x] Budget approvals and audit rows made upsert-only, so a save that omits them cannot delete history.
- [x] CREATE → SAVE → REFRESH → VERIFY confirmed in the browser against PostgreSQL (2026-08-15; row inspected directly with `psql`, correct month and ISO week).
- [x] EDIT → SAVE → REFRESH → VERIFY confirmed (2026-08-15).
- [x] Server-restart durability confirmed (2026-08-15; data survived a dev-server restart and a hard reload).
- [x] Targeted, non-destructive persistence verified: an edit updates in place without duplicating or deleting siblings, and removing one entry deletes only that entry (2026-08-15).
- [x] Zero preserved as zero through the full round trip, distinct from missing (2026-08-15).

### Multi-device synchronization

- [x] Added `snapshots.revision` with optimistic concurrency (migration `003-add-snapshot-revision`) (2026-08-15).
- [x] `PUT /api/snapshot` rejects a stale write with 409 and returns the current server snapshot (2026-08-15; integration-tested).
- [x] Client adopts the server snapshot on conflict and surfaces an explanatory notice rather than overwriting newer data (2026-08-15).
- [x] DEVICE A WRITE → DEVICE B READ verified with two isolated browser contexts, device B starting with empty IndexedDB (2026-08-15).
- [x] DEVICE B EDIT → DEVICE A READ verified (2026-08-15).
- [x] Stale-write rejection verified end to end: the database kept device B's data, the stale entry was never written, and the user was told to re-apply (2026-08-15).

### Server runnability (the compiled server had never been able to start)

- [x] Added `.js` extensions to relative imports and replaced the unresolvable `@/domain/*` alias with real relative paths; `node dist/server/src/index.js` now boots (2026-08-15).
- [x] Fixed `server:prod`, which pointed at a non-existent `dist/index.js` (2026-08-15).
- [x] Fixed `server:dev`, which invoked `ts-node` — not a dependency — and now uses `tsx` (2026-08-15).
- [x] `/api/health` answers when the database is down, reporting `503 degraded` with the reason instead of being indistinguishable from a dead server (2026-08-15).
- [x] Malformed JSON returns 400 rather than an opaque 500, and snapshot payloads are shape-checked before they can truncate stored collections (2026-08-15).

### Analytics

- [x] Added `src/domain/analytics.ts` as the single shared calculation layer; Dashboard and Analytics page both consume it, ending the duplicate implementations (2026-08-15; 19 selector tests).
- [x] **Dashboard now respects the global period selector.** It previously always reported the selected month regardless of week or year mode (2026-08-15; verified in the browser).
- [x] Analytics respect month / ISO week / year and historical periods (2026-08-15; verified in the browser in every mode).
- [x] All values derive from real entries; no placeholder or hard-coded data (2026-08-15).
- [x] Added median transaction, largest transaction, daily average, projected total, projected end-of-period remaining, required daily pace, and previous-period comparison including across year boundaries (2026-08-15).
- [x] Weekly trend charts show a window containing the selected week; they previously always rendered weeks 1–12, hiding the current week for most of the year (2026-08-15).
- [x] Missing periods render as `?` / "No data", never as a fabricated zero (2026-08-15; verified in the browser and by test).
- [x] Chart rendering shared through one `TrendBarChart` component (2026-08-15).

### Data-loss and correctness fixes

- [x] **Editing a transaction no longer destroys its recurrence.** `SpendingPanel` hardcoded `recurrenceType: "none"` on add *and* edit, so editing any field silently reset a recurring expense to one-off. Recurrence is now editable and preserved (2026-08-15; regression test plus live browser confirmation that editing an amount kept `monthly`).
- [x] Transaction dates use the local calendar date. `new Date().toISOString()` yields the UTC date, so east of UTC an entry made after midnight was filed to the previous day, and on the 1st of a month to the previous month and budget period (2026-08-15; regression tests).
- [x] Category `bucket` and `monthlyCap` locked while a historical period is selected, since calculations read them live and changing them rewrites reported history (2026-08-15; regression tests).
- [x] Corrected the category note that claimed edits never affect historical records — true for stored transactions, false for computed totals (2026-08-15).
- [x] Category parent assignment rejects self-parenting and cycles, in the store and the API (2026-08-15; regression tests).
- [x] `PATCH /api/spending/:id` recalculates the year and moves the entry into the matching year record on a cross-year date change, matching the client store (2026-08-15).
- [x] `PATCH /api/categories/reorder` registered before `/:id`; it was permanently shadowed and always answered "Category not found: reorder" (2026-08-15).
- [x] Archived categories remain selectable while editing an entry that already uses one, so the form no longer displays a category the transaction does not have (2026-08-15).

### Mobile

- [x] Fixed horizontal overflow at narrow widths. `auto`/`1fr` grid tracks are floored at min-content, so wide charts widened the page; all page grids now use `minmax(0, ...)` (2026-08-15).
- [x] Verified zero horizontal overflow across all ten views at 320 px and 375 px (2026-08-15).
- [x] Verified landscape (844×390) and tablet (834×1112) across all ten views (2026-08-15).
- [x] **Wishlist, Activities, Categories, History and Scenarios were unreachable on mobile** — "More" opened Settings directly. Added a More sheet exposing all six sections (2026-08-15; verified in the browser).

### Theme

- [x] Verified light mode, dark mode, switching, and persistence across a reload (2026-08-15).
- [x] Verified dark mode on dashboard, analytics, charts, cards, forms, period selector, historical mode, and mobile navigation (2026-08-15).
- [x] Strengthened dark-mode semantic tints, which washed out against dark surfaces at 8% alpha (2026-08-15).

### Colour and accessibility

- [x] Semantic tinted rails and washes on metric cards; category bars use each category's own colour (2026-08-15).
- [x] Status carried by rail, value colour, and icon together so it never depends on hue alone (2026-08-15).
- [x] Progress bars expose `role="progressbar"` with value and label; charts carry descriptive `aria-label`s (2026-08-15).

### Testing and tooling

- [x] 81 tests across 10 files, all passing (2026-08-15; was 31).
- [x] Added `tests/db-integration.test.ts` (11 tests) and `tests/api-integration.test.ts` (10 tests) exercising real PostgreSQL; skipped unless `TEST_DATABASE_URL` is set (2026-08-15).
- [x] Added `setDatabase()` seam and `scripts/dev-server-local-pg.mjs` so the backend runs and is testable without a Neon account (2026-08-15).
- [x] Vite proxies `/api` so development uses the real API path instead of silently falling back to IndexedDB (2026-08-15).
- [x] Frontend and server builds pass (2026-08-15).
- [x] Removed dead code: `ActivityEditor`, `WishlistEditor`, `src/api/hooks.ts` (all zero-importer), the unused `recharts` dependency, and stale compiled artifacts committed under `src/domain/` (2026-08-15).

## Completed in earlier sessions

- [x] Audited the documented architecture against the checked-out source (2026-08-09).
- [x] Restored the eight primary client workflows (2026-08-09).
- [x] Added store-level protection against historical period-bound mutations (2026-08-09).
- [x] Added approved-budget immutability guards in the store and API (2026-08-10).
- [x] Introduced a shared calendar/ISO period model with a separate `selectedWeekYear` and cross-year week navigation (2026-08-10).
- [x] Extended API validation to categories, activities, settings, and approvals (2026-08-10).
- [x] Replaced destructive whole-snapshot persistence with targeted upserts and selective deletion (2026-08-10).
- [x] Rebuilt the analytics panel with real period-aware data (2026-08-11; further unified behind shared selectors on 2026-08-15).
- [x] Implemented the wishlist editing workflow (2026-08-11; audited and confirmed working 2026-08-15).
- [x] Implemented category editing with parent, cap, and description (2026-08-11; integrity gaps fixed 2026-08-15).

## Not verified — do not mark complete without evidence

- [ ] **Production Vercel deployment.** Requires authenticated deploy access and a production `DATABASE_URL`; neither is available here. The build compiles and the function entrypoint mounts the Express app, but production routing and database connectivity are unconfirmed.
- [ ] **Neon HTTP driver behaviour**, especially `sql.transaction([...])`. All SQL is verified against real PostgreSQL through an equivalent driver interface; Neon's own transport has not been exercised.
- [ ] **Real multi-hardware sync.** Two isolated browser contexts against one server were used, which exercises the same client/server/database path but not physically separate devices or networks.

## Discovered issues

- [x] Persistence had never run against a real database; five SQL-level defects were live (2026-08-15; see `docs/DATABASE.md`).
- [x] The compiled server could not start at all — extensionless ESM imports, an unresolvable path alias, a wrong `server:prod` path, and a `server:dev` script calling a missing dependency (2026-08-15).
- [x] Editing any transaction silently reset its recurrence type (2026-08-15).
- [x] The Dashboard ignored the global period selector (2026-08-15).
- [x] Five sections were unreachable on mobile (2026-08-15).
- [x] Horizontal overflow on every view at portrait widths (2026-08-15).
- [x] `PATCH /api/categories/reorder` was permanently unreachable (2026-08-15).
- [x] "Today" resolved to the UTC date, mis-filing after-midnight entries east of UTC (2026-08-15).
- [x] **Historical editing** — was an open product question, now decided and implemented as allow-with-consent plus a full audit trail (2026-08-15). Back-dating from the current period stays permissive by design, since a dedicated audited path now exists for rewriting a closed period.
- [x] Budget approvals were never rendered in the History panel (2026-08-15).
- [x] `monthlyCap` was stored and editable but used by no calculation (2026-08-15).
- [x] The wallet panel showed no balance (2026-08-15).
- [x] Ctrl+Z broke native undo in every text field while providing no undo (2026-08-15).
- [ ] **The granular REST routes are not on the live write path.** The client persists only through `GET`/`PUT /api/snapshot`; the per-entity routes are implemented and validated but unused by the UI, so their validation constrains nothing today. Either wire the client to them or treat them explicitly as an external API surface.
- [ ] `PATCH /api/snapshot/settings` spreads the request body into settings with no per-field validation. Not on the client's write path today, but it is reachable.
- [ ] Wishlist totals sum `actualPrice` across mixed currencies without conversion before formatting the result as a single currency.
- [ ] `POST /api/snapshot/reset` is a stub that reports success without doing anything.
- [ ] The main bundle exceeds 500 kB; code-splitting has not been attempted.
- [ ] **Import is unreachable.** `importBudgetWorkbook` and `importJsonBackup` are implemented but no component calls them, and there is no file input anywhere in the app. Export works, so data can leave but not return.
- [ ] **Seasonal presets are unreachable.** `applySeasonalPreset` and `SeasonalPreset.activityOverrides` are implemented and seeded but no component calls them; this is also the only writer of `settings.selectedSeason`.
- [ ] `ScenarioLab` applies a preset destructively with no preview or diff, and presets cannot be created, edited, or deleted — the store has only `applyScenarioPreset`.
- [ ] `ActivityPanel` covers 10 of 15 `Activity` fields. `pricePerPurchase` and `yearlyEstimate` are missing even though "purchase" and "yearly" are selectable recurrence types, so those costs cannot be entered. `duplicateActivity`, `reorderActivity`, `matchesActivityFilters`, and `sortActivities` all exist and are called by nothing.
- [ ] `calculation.categoryTotals` is computed on every recalculation and consumed by nothing; analytics computes its own breakdown.
- [ ] Four settings are seeded but read by no code path: `autoWalletRollupEnabled`, `promptBeforeMonthClose`, `liveClockEnabled`, `nanPolicy`. Either wire them up or remove them.
- [ ] `YearRecord.monthlyNotes` exists as a type with no store action and no UI.
- [ ] No component tests exist; panels are verified manually in the browser. A Playwright suite would lock in the flows checked by hand this session.
