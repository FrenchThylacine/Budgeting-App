# Changelog

## 2026-08-16 — Excel import

### The importer existed but was wired to nothing, and did not work

`importBudgetWorkbook` had never been reachable: there was no file input anywhere in the application. Run against the real workbook for the first time, it also turned out to be substantially wrong.

| Expected | Imported |
|---|---|
| 8 activities | **6** — Gym and Arabic lost |
| 14 wishlist items | **12** — the two most expensive lost |
| Weeks 1→33 | **11→33** — the first ten lost |
| 5 years (2026–2030) | **1** — the rest silently deleted by the save's targeted-delete pass |
| Balance €339.39 | **0** |

Two causes. Cells were addressed by hardcoded row number, and the sheet was read with `blankrows: false` — which drops empty rows, so every index below the workbook's first blank separator row was off by two. And `parseAmount` could not read `"€339.39"`, so an unknown balance became a *stated zero*, which is a different and wrong number rather than a missing one.

### Rewritten around header detection

`domain/workbookImport.ts` locates everything by its header text: the `Activities` row, the `What I want` column, the `Year` row and the label under each year that says which of its three columns is USD and which is EUR. Blank rows, inserted columns and moved metadata no longer matter. Verified against the real file: 8 activities, 14 wishlist items, 5 years, 48 transactions, balance €339.39, and a spending total of **€2,399.48** against the **€2,399.47** the sheet computes for itself.

- **Missing stays missing.** Empty cells, `N/A` and `NaN` produce nothing; `0` is kept, because a week with no spending is a fact the user recorded. A corrupted `parseAmount` that returns 0 for unknown fails four tests.
- **Failures are loud.** A missing sheet names the sheets the file does contain; a missing `Activities` or `Year` header is an error. The old code fell back to the first sheet in the workbook and to the seed's own activities, presenting invented data as if it had been read from the file.
- **Identifiers are generated per import**, not derived from the file. They are primary keys in tables shared by every account, so two people importing the same workbook would otherwise collide on every row — the defect migration 006 exists to prevent.
- Weeks 53–55, which the sheet prints as layout for every year, are skipped with one aggregated note rather than fifteen.
- The monthly block below the weekly one is deliberately not imported; it restates the same figures and reading both would double every amount.

### An import now shows what it will destroy, first

An import **replaces** the budget: the save deletes anything absent from the incoming snapshot. A preview dialog now states that plainly, with a before/after count of years, categories, activities, transactions, wishlist items and wallet entries, an explicit warning naming any year that will be deleted, the file's own notes, a one-click backup, and a confirmation checkbox that keeps the destructive button disabled until it is ticked. The import goes through `importSnapshot`, so it lands on the undo stack — verified in the browser: import, then undo, and the previous budget returns.

### Also

- `scripts/create-account.ts` creates or resets an account from the command line. It is not a back door: the password goes through the same scrypt hashing and the account has no elevated rights. The only rule it relaxes is the password minimum, and only when the database is on localhost — against anything else it refuses with an explanation.
- The superseded importer and the ten helpers only it used were deleted rather than left beside the replacement; `importExport.ts` drops from 400 to 121 lines.

**Verification** — `npx tsc -b` clean · **355 tests passing**, 61 against real PostgreSQL 17 · both builds clean · the full round trip driven in a browser: file → preview → confirm → store → API → PostgreSQL → read back → undo.


## 2026-08-16 — Accounts

### Email and password sign-in, with the data model made safe for it first

Adding accounts to this schema would have destroyed data. Three defects had to be fixed before a single line of authentication was written, all confirmed against a real PostgreSQL 17 server rather than a mock.

- **`budget_approvals` had no owner column**, and the repository read it with `SELECT * FROM budget_approvals` — no `WHERE` clause at all. Every budget would have loaded every other budget's approvals, which this project treats as permanent financial records.
- **Every seed identifier was hardcoded** (`cat-health`, `act-gym`, `wish-1`, …). Those are primary keys in tables shared by all budgets, so two seeded budgets collided on every row, and `ON CONFLICT (id) DO UPDATE` rewrote the existing row while leaving `snapshot_id` pointing at the original owner. The second account created would have taken over the first one's data on its first save. Identifiers are now generated per budget; a new `seedKey` carries the stable identity the app matches on, so the nine places that referenced those literals still resolve.
- **Category deletion was ordered before the rows that reference it.** Found by the new tests and live regardless of accounts: `activities.category_id`, `spending_entries.category_id` and `wishlist_items.category_id` are `ON DELETE RESTRICT`, and PostgreSQL checks those statement by statement rather than at commit — so replacing a budget's whole category set aborted the transaction with a bare foreign-key error. That is exactly what an Excel import or a reset to seed does.

Every `ON CONFLICT (id) DO UPDATE` now carries `WHERE <table>.<owner> = EXCLUDED.<owner>`, so a cross-budget identifier collision can never rewrite another account's row under any circumstances.

### How authentication works

- **Passwords are hashed with scrypt** from `node:crypto` — no native module to compile, which matters on Vercel where a binding that fails to load takes the deployment down. The cost parameters are stored inside each hash, so raising them later does not invalidate anyone; a stale hash is upgraded quietly on the next successful sign-in.
- **Sessions are opaque random tokens, stored hashed**, in an `HttpOnly` / `SameSite=Lax` cookie. Opaque rather than JWT because they must be *revocable*: signing out ends the session immediately, and a password reset invalidates every session that existed before it. A database dump yields no usable session.
- **Password reset** links work once and expire in 30 minutes. Sent through Resend's HTTP API — called with `fetch`, so no SDK dependency is added. `forgot-password` answers identically whether or not the address has an account, and whether or not mail was actually sent: any variation would turn it into a way to enumerate accounts.
- **Rate limiting lives in the database**, because serverless instances share no memory — an in-process counter resets on every cold start and would cap nothing.
- **CORS is now an allowlist.** It was `origin: "*"` with `credentials: true`, a combination browsers reject outright, so the session cookie would never have been sent at all.
- **`SIGNUP_INVITE_CODE`** (optional): when set, signup requires it. A personal finance app on a public URL otherwise lets anyone create an account.

The **first account created adopts the budget that already existed**, so introducing accounts does not orphan the data the app was already holding.

### The offline cache is now per account

IndexedDB used a single slot named `active`. With accounts that is a leak: sign out, sign in as someone else, lose the network for a moment, and the app would hydrate the previous person's budget and present it as the current account's. The cache is keyed by account, signing out clears **every** cached budget on the device, and a 401 is now a distinct error that the store refuses to serve from cache — previously any failed request fell through to it.

### Two bugs found by testing in a real browser

- **The API client's request wrapper called itself**, so every request recursed until the stack overflowed. The whole suite stayed green: the integration tests drive Express over HTTP and never touch that class. It surfaced only as a permanent "Offline" badge, because the overflow was caught and reported as an unreachable API. `tests/api-client.test.ts` now covers it.
- **`classList.toggle("dark", undefined)` flips the class rather than clearing it**, so a snapshot stored without `darkMode` inverted the theme on every run of the effect — leaving a dark page with light-scheme form controls.

### Verification

`npx tsc -b` clean · **330 tests passing**, 61 of them against a real PostgreSQL 17 server · both builds clean. The new isolation and authentication suites were each re-run against the previous code and fail there, so they measure the fixes rather than merely accompanying them. The full flow was then driven in a real browser: sign up, sign in, two accounts in isolated contexts confirming neither can see the other's budget, sign out clearing the cache, and a 375 px viewport with no horizontal overflow.


## 2026-08-16 — V3

### Multi-device synchronization was broken. This is the fix.

Testing in a normal window and a private window showed changes not syncing. The cause was not the conflict guard — it was that **an unreachable API was silently indistinguishable from a successful save**.

Both `loadSnapshot` and `saveSnapshot` caught API failures and fell through to IndexedDB. A browser with a broken or unconfigured backend therefore looked exactly like a healthy one, while each browser quietly accumulated its own private dataset. Nothing in the UI ever said otherwise.

- **The server is now authoritative whenever reachable**, and IndexedDB is an explicit offline cache. Hydration asks the server first, so a device never boots from a stale cache and then overwrites newer remote data.
- **Persistence state is visible**: `Saved`, `Saving…`, `Offline — this device only`, `Sync conflict`, `Sync failed`, each with a Retry action, in the header and in Settings. "API unavailable" is never presented as "saved".
- **Returning to a tab re-checks the server**, so a change made on another device appears without a manual reload (`GET /api/snapshot/revision` is a cheap probe).

### The concurrency guard was itself unsafe

The previous scheme trusted a client-supplied `revision` and accepted anything higher than stored. A device that edited while offline keeps incrementing its own counter, so it could reconnect with a larger number and **overwrite whatever the other device had done in the meantime**.

Writes are now a compare-and-swap on `baseRevision` — the revision the client last read — and the **server** assigns the next revision. A client cannot inflate its way to winning, because a stale base is exactly what gets rejected. Legacy requests without `baseRevision` keep the old monotonic check so they still work.

Verified end to end with two isolated browser contexts against a live PostgreSQL database: A wrote → B read it → B edited → A saw the edit on focus without reloading → a stale write from A was rejected with B's data intact. Then with the server stopped: the UI reported Offline, and Retry after restart delivered the change.

### New fields were being silently dropped

The repository writes a **fixed column list**, so several model fields never survived a round-trip. Migration `005` adds them and the integration suite now has a round-trip test per group: activity `icon`/`color`/`costModel`/`sessionsPerMonth`/`weekdays`/`dayOfMonth`/`startDate`, wishlist `url`/`color`/`linkedSpendingId`, and spending `wishlistItemId`.

### Analytics are now charts, not number walls

A dependency-free SVG chart library (`src/components/charts/`): line, bar, stacked bar, donut, heatmap, sparkline, horizontal bars, and a large gauge. Every chart is theme-aware, accessible (`role="img"` with a description), and scrolls inside its own container.

- **Intelligent gridlines.** `niceTicks` picks 1/2/5×10ⁿ steps from the data range — a 0–20,000 range produces five lines, not two hundred.
- **Labelled budget reference lines** on budget-related charts, drawn subtly so they guide without dominating.
- Both the Analytics page and the Dashboard were rebuilt chart-led: spending trend, budget vs actual, cumulative forecast against the budget ceiling, category bars with cap markers, category evolution, recurring/one-off donut, daily heatmap, and period comparisons.
- **Missing data is drawn as missing** — broken lines, `?` markers, dashed cells — never as a fabricated zero.

### Budget health became the centrepiece

A composite 0–100 score with its contributing factors shown as bars, rendered in a large gauge. The score corrects an honesty bug found while building it: `budgetPacing` reports spend 0 for a period with *no records*, which scored an empty month as perfect adherence. A period we know nothing about now earns no factor at all.

### Recurring expenses became flexible

Four cost models: `auto` (unchanged legacy inference), `perSession` (price × sessions per month), `schedule` (price × **real occurrences in that calendar month** — some months have five Mondays), and `fixed`. Yearly figures follow the same model rather than assuming monthly × 12. Activities gained a searchable, categorised icon picker (84 lucide icons across 11 categories) and a colour that themes the entire card, not just a dot.

### Currency

- **Live exchange rates** from a keyless public provider, cached with a staleness window, with a manual override that a refresh never overwrites and a fallback that leaves existing rates untouched when the provider is unreachable.
- **Fixed a silent conversion fault**: `rateToBase` returned `1` for any pair it did not know, so a GBP amount was counted as if it were EUR. Rates now pivot through EUR when provider data exists, non-positive rates are ignored rather than zeroing amounts, and `canConvert` lets callers detect the fallback instead of trusting it.

### Reports

Printable monthly and annual reports, generated from the same shared selectors as the screen, opened in a new window with a print/save-as-PDF action (falling back to a download if pop-ups are blocked). Self-contained HTML with no external assets, user text escaped, and unknown months marked rather than drawn as empty bars.

### Typography and colour

A single type scale defined as tokens and consumed through `.text-*` utilities, with **tabular numerals on every financial figure** so amounts align in columns and a changing value does not shift its neighbours. Semantic colours were strengthened and given a coordinated eight-colour chart series ordered for colour-vision safety; dark mode redefines both hue and alpha, because a light tint disappears on a dark surface. Status is never carried by colour alone.

### Also fixed

- **Period navigation**: a "Go to current month/week/year" action that appears only when you are not there, and the header now states the selected period's full date range alongside the real current period, so a historical view can never be mistaken for today.
- The header showed an ISO week number in month mode that often belonged to a different month.
- `createSeedBudgetSnapshot()` returned the shared module-level `defaultCategories` array, so adding a category mutated the seed for every snapshot created afterwards in the same process.
- A lucide `Map` icon import shadowed the global `Map` constructor and crashed the app with "Map is not a constructor".
- New loading screen and tab transitions, both respecting `prefers-reduced-motion`.

## 2026-08-15 (later)

### Consent-gated historical editing, a real audit trail, and working category caps

#### Editing a closed period

Closed periods were strictly read-only, which made a late receipt or a miscategorised expense impossible to correct. They are now editable through a deliberate, audited path:

- The historical banner offers **Edit this period**, opening a consent dialog that states the consequences and requires an explicit acknowledgement before the confirm button enables.
- While unlocked the banner switches to a danger state naming the period, with a one-click **Relock**.
- Every period-bound change is recorded in the audit trail flagged as a historical edit, along with the period it rewrote.
- **Approved budgets stay immutable.** The override unlocks data, never decision records, so `recordBudgetApproval` checks the period directly rather than the override.
- The unlock is session-only: never persisted, never synced to another device, and cleared automatically as soon as the period changes.

#### History panel rebuilt — the audit trail was invisible

The panel was 11 lines showing a 12-month list. The store keeps **300 audit entries**; exactly one was visible anywhere in the app (the latest, in the header).

- Four sections: Periods, Month closes, Budget approvals, Audit trail.
- **Fixed a real bug: budget approvals never rendered.** The old code was `{approvals.length === 0 && <EmptyState/>}` with no else branch, so approvals showed an empty state when empty and nothing at all when populated. Their amounts, decisions, and dates had never been visible.
- Month close records — status, final total, delta, rollover — are surfaced for the first time.
- Audit trail with type filters, a dedicated "Historical edits" filter, and a banner counting changes that rewrote a closed period.

#### Category caps now do something

`monthlyCap` was editable and stored but read by **no calculation anywhere** — setting a cap had no effect.

- Cap tracking added to the shared analytics selectors: usage percentage, remaining headroom, and breach detection.
- The analytics category breakdown shows spend against cap with a colour-coded bar and an "Over cap" badge; without a cap it still shows share of spending.
- The dashboard surfaces a breach alert naming each category and the amount over.
- Caps apply in month mode only — comparing a year's spend against a monthly cap would report a false breach.
- A cap of `0` is honoured as a real limit ("spend nothing here"), not treated as unset.

#### Wallet and Settings

- **The wallet showed no balance.** It was computed and displayed on other pages but not on the Wallet panel itself. It now leads with wallet, personal, rollover, and opening balances, gains entry-type selection (previously hardcoded to `personal`), notes, inline editing (`updateWalletEntry` existed but nothing called it), month names instead of `month 7`, and a base-currency equivalent for foreign-currency entries.
- **Settings exposed 5 of 20 fields.** Most notably `monthlyBudgetCurrency` was missing, so the budget amount was interpreted in a currency the user could neither see nor change. Added currency format, rounding rule, budget currency, year-end wishlist behaviour, save-timestamp, and editable exchange rates — which previously could only be changed by importing a spreadsheet through a UI that does not exist.

#### Ctrl+Z no longer breaks typing

The global handler called `preventDefault()` on Ctrl+Z and then did nothing, disabling native undo inside every text field while providing no undo of its own — despite the header advertising the shortcut. It now performs undo/redo and stays out of the way while the user is typing.

#### Testing

94 tests (up from 81), including 13 new ones covering the historical-editing override, audit flagging, auto-relock, approval immutability under override, and category cap behaviour. Two new database integration tests confirm the audit flags round-trip through PostgreSQL (migration `004-add-audit-historical-edit`) and that omitting the audit log from a payload cannot erase it.

## 2026-08-15

### Verified persistence against a real database, shared analytics, and mobile repairs

#### Persistence — five defects found by testing against real PostgreSQL

The persistence layer had only ever been tested with a mocked driver, so SQL-level faults went unnoticed. Running it against a live PostgreSQL server surfaced five failures, all fixed:

- **Multi-statement DDL.** `initializeSchema` grouped `CREATE TABLE` with `CREATE INDEX` in single tagged templates; the Neon HTTP driver executes one command per call, so schema creation failed outright. Every statement is now its own template.
- **Integers bound to BOOLEAN columns.** Flags were written as `1`/`0`, which PostgreSQL rejects for `BOOLEAN` (SQLite tolerated it). All flags now bind real booleans.
- **Corrupted entry years.** `parseSpendingEntry` recovered the year from the year-row id suffix, but those ids embed `Date.now()`, so every loaded entry received a nonsensical year that fell back to a hard-coded `2026`. The year now comes from the `years` table.
- **Non-atomic saves.** Statements ran one by one, so a mid-save failure left the database partly written. All writes are collected and executed in a single `sql.transaction([...])` batch.
- **Historical records exposed to deletion.** Budget approvals and audit rows took part in the delete pass; both are now upsert-only.

#### Multi-device synchronization

- Added `snapshots.revision` (migration `003-add-snapshot-revision`), a counter incremented by each client commit.
- `PUT /api/snapshot` rejects a write whose revision is not newer than the stored one with **409 Conflict**, returning the current server snapshot. The client adopts it and asks the user to re-apply their change instead of silently overwriting a newer device's data.
- Verified in the browser across two isolated sessions: device A wrote, device B read it, device B edited, device A saw the edit, and a stale write from device A was rejected without data loss.

#### The server could not actually run

`npm run server:build` only proved that `tsc` emitted files. The output had never been executable:

- Relative imports lacked the `.js` extensions Node's ESM loader requires, and `@/domain/*` was emitted verbatim with nothing to resolve it. Both are now real relative paths.
- `server:prod` pointed at `dist/index.js`, which does not exist (the emitted path is `dist/server/src/index.js`).
- `server:dev` invoked `ts-node`, which is not a dependency. It now uses `tsx`, which is.
- `/api/health` required the database, so a misconfigured database looked identical to a dead server. It now answers `503 degraded` with the reason, and API errors name the missing `DATABASE_URL` instead of returning an opaque 500.

#### Analytics — one shared calculation layer

- Added `src/domain/analytics.ts` holding every period-aware selector. The Dashboard and the Analytics page now read from it instead of maintaining separate, divergent implementations.
- **The Dashboard previously ignored the global period selector**, always reporting the selected month even in week or year mode. It now follows the selected period everywhere.
- New figures: median and largest transaction, daily average, projected end-of-period total, required daily pace to stay on budget, and previous-period comparison (including across year boundaries).
- Weekly trend charts now show a window containing the selected week; previously they always rendered weeks 1–12 and hid the current week for most of the year.
- Missing periods render as `?` or "No data" and never as a fabricated zero.

#### Data-loss fixes

- **Editing any transaction reset its recurrence to one-off.** `SpendingPanel` hardcoded `recurrenceType: "none"` on both add and edit, so changing an unrelated field silently destroyed the recurrence of a recurring expense. Recurrence is now an editable field and is preserved.
- Category `bucket` and `monthlyCap` are read live by budget calculations, so changing them rewrites how past periods are reported. Both are now locked while a historical period is selected, and the misleading "does not change historical records" note has been corrected.
- Category parent assignment now rejects self-parenting and cycles in both the store and the API.
- `PATCH /api/spending/:id` now recalculates the year and moves the entry into the matching year record when its date crosses a year boundary, matching the client store.
- `PATCH /api/categories/reorder` was permanently shadowed by `PATCH /:id` and always answered "Category not found: reorder". It is now registered first.
- Transactions dated with `new Date().toISOString()` used the **UTC** date, so east of UTC an entry made after midnight was filed to the previous day — and on the 1st of a month, to the previous month and budget period. Local calendar dates are now used.

#### Mobile

- Fixed horizontal overflow at 320–430 px. Grid tracks default to `auto`/`1fr`, which are floored at the largest item's min-content, so wide charts widened the whole page. All page grids now use `minmax(0, ...)`. Verified zero overflow across all ten views at 320 px and 375 px, plus landscape and tablet.
- **Wishlist, Activities, Categories, History and Scenarios were unreachable on mobile** — the "More" tab opened Settings directly. Added a More sheet exposing all six sections.

#### Colour and accessibility

- Semantic tinted rails and soft washes on metric cards; category bars now use each category's own colour.
- Status is carried by rail, value colour, and icon together, so it never depends on hue alone. Progress bars expose `role="progressbar"` with values and labels, and charts carry descriptive `aria-label`s.
- Strengthened dark-mode semantic tints, which were washing out against dark surfaces at 8% alpha.

#### Testing and tooling

- 81 tests (up from 31), including `db-integration` and `api-integration` suites that exercise real PostgreSQL — schema, migrations, transaction rollback, boolean round-trips, approval immutability, conflict rejection, and zero-preservation. Each suite owns a PostgreSQL schema so they stay isolated in parallel.
- `setDatabase()` injection seam plus `scripts/dev-server-local-pg.mjs` let the backend run and be tested without a Neon account (`npm run server:dev:pg`, `npm run test:db`).
- Vite now proxies `/api` so development exercises the real API path rather than falling back to IndexedDB.
- Removed dead code: `ActivityEditor`, `WishlistEditor`, `src/api/hooks.ts` (all zero-importer), the unused `recharts` dependency, and stale compiled artifacts committed under `src/domain/`.

## 2026-08-11

### Analytics panel rebuilt, wishlist editing, and category editing

#### Analytics — real data, period-aware, with charts and burn rate

- Rebuilt `AnalyticsPanel.tsx` from the ground up (previously a minimal 85-line placeholder).
- All analytics now read exclusively from real `snapshot.years[*].spendingEntries` via the same period-filtering logic as the Spending panel: month, ISO week, and year modes all produce correct entry sets.
- New sections: KPI metrics row (total spend, budget remaining, average transaction, burn rate %); Budget vs Actual with progress bar and colour-coded delta (month mode); Recurring vs non-recurring split with percentages; SVG sparkline bar chart for 12-month and up to 26-week trends; Category breakdown with per-category progress bars (piloting correctly excluded from share %); Savings & Wallet section (wallet total + wishlist active total).
- Historical period detection banner (read-only notice when `isHistoricalPeriod` is true).
- Zero spend is preserved as €0; pending/missing periods show '?' in the chart. No fake data or mock values.
- No external chart libraries — charts use inline SVG with `viewBox` for mobile responsiveness.
- Added `tests/analytics-filtering.test.ts` with 7 regression tests: month/week/year period isolation, zero-value preservation, piloting bucket separation, recurring vs non-recurring split accuracy, and cross-month year total. Vitest suite: **7 files, 31 tests, all passing**.

#### Wishlist — full editing workflow

- Completely rewrote `WishlistPanel.tsx` (previously all minified onto one line with no edit capability).
- View filter tabs with live counts: Active / All / Bought.
- Add form with all WishlistItem fields: name, price, currency, priority (low/medium/high/dream), notes, inWishlist.
- Inline edit form per-item: pre-loaded with existing values, saves via `store.updateWishlistItem`, validates name non-empty, price if present is finite ≥ 0. Cancel without saving does not mutate state.
- Mark-bought button, delete with `window.confirm`, priority colour dots, truncated notes preview.
- Summary footer: active count, active value total, bought count.
- All controls hidden in historical/read-only periods (`isCurrentPeriodMutable() === false`).
- Mobile: all flex layouts use `flexWrap`, inputs have `minWidth` constraints.

#### Categories — full editing workflow

- Completely rewrote `CategoryManager.tsx` (previously only add/archive with no edit capability).
- Inline edit form per-category with all `BudgetCategory` fields: name, bucket (General/Piloting/Personal/Wallet), colour picker, monthly cap, parent category (1-level), description, icon name, notes.
- Patch flows through `store.updateCategory` — existing spending and activity records are not touched.
- Archive / Restore: archiving soft-hides the category; restoring via `updateCategory({ archived: false })`.
- Archived categories collapsible section (expand/collapse toggle).
- Referential-integrity note shown to users.
- Parent category select excludes self and already-archived categories.

#### Builds and tests

- Frontend build: ✅ 1616 modules, zero TypeScript errors (bundle-size advisory only, pre-existing).
- Server build: ✅ 0 errors.
- Test suite: ✅ 31/31 tests passing across 7 files.

## 2026-08-10

### Safe targeted snapshot persistence and API validation hardening

- Refactored `SnapshotRepository.ts` to replace destructive whole-table deletions (`DELETE FROM <table_name> WHERE year_id = $1`) with targeted `ON CONFLICT (id) DO UPDATE SET ...` upsert queries and selective deletion of removed IDs (`id NOT IN (...)`). This protects audit history, foreign keys (`spending_entries.activity_id`), and concurrent write safety.
- Hardened Category, Activity, and Approval API routes with input validation (`validateFiniteNumber`, `validateEnum`, `validateRequired`, category-reference validation, recurrence interval bounds, and non-negative amount checks).
- Enforced approved-budget immutability across `POST /api/approvals` and `PATCH /api/approvals/:id` so approved monthly budgets cannot be overwritten.
- Added automated unit tests for API validation helpers and `SnapshotRepository` targeted upsert persistence. Vitest suite now has 6 test files and 24 passing tests; frontend and server TypeScript builds compile cleanly.

### Global period navigation and analytics repair

- Redesigned the header into a compact Month / Week / Year control with previous/next navigation and a clear selected-period label. The control now treats ISO weeks as first-class periods rather than a cosmetic month selector.
- Added an explicit persisted ISO week-year alongside the calendar year. This keeps week 1 and week 53 correct across New Year, prevents month/week state from contradicting itself, and makes changing between period modes predictable.
- Centralized period labels, navigation, current-period comparison, and historical detection in one domain module. Historical state now produces one application-level banner and a non-blocking contour around the main content, so major tabs use the same source of truth instead of duplicating month-only checks.
- Repaired Spending and Analytics filtering to use the active global month, ISO week, or year and to collect weekly entries across the two calendar-year records a boundary week can span. Transaction creation now records its calendar year from the entered date, and date edits relocate a transaction to the correct year record when necessary.
- Analytics continues to calculate money through the existing currency normalization path, excludes Piloting from standard category-share percentages, and labels that exclusion instead of presenting it as ordinary spend.
- Added ISO regression coverage for New Year boundaries, prior-week historical mode, week-53 navigation, mode transitions, and store-level historical-write guards. The suite now has 4 files and 19 passing tests; frontend and server builds also pass. Visual/mobile verification remains open.

### Spending API validation

- Added shared Express validators for finite numeric inputs, calendar dates, and fixed-value enums.
- Applied them to spending creation and updates so `NaN`, invalid dates, mismatched date/month values, archived or unknown categories, unsupported currencies, and unsupported recurrence types fail with a structured client error instead of entering persisted data.
- Retained zero as a valid amount. Transaction date edits now update both the stored month and ISO week, keeping weekly and monthly calculations aligned after an edit.
- `npm run test`, `npm run build`, and `npm run server:build` passed after the API change.

### Theme and deployment architecture audit

#### Theme-system repair

- Moved the dark-theme token scope from an app-shell-only class to `html.dark`, which is where page background, browser-native form controls, and all descendants consistently inherit the selected theme.
- Synchronised `settings.darkMode` with `document.documentElement` and its `color-scheme` property. This preserves the persisted setting while making native inputs and browser chrome follow the selected mode.
- Added a tokenized application background and replaced stale `--line-strong` and `--muted` references in modal and auxiliary styles with the active design-system tokens. This removes undefined CSS values that could render inconsistently in dark mode.

#### Deployment preparation

- Split Express initialization from the local listener: `server/src/app.ts` creates the reusable application, while `server/src/index.ts` starts it only for local development.
- Added `api/[...path].ts` as the Vercel Functions entrypoint and `vercel.json` for the Vite production build. This keeps local `server:dev` behavior intact while enabling Vercel to serve the REST API.
- Added the API directory to frontend TypeScript validation so the serverless entrypoint is checked by `npm run build`.

#### Verification

- `npm run test`, `npm run build`, and `npm run server:build` passed after these changes. The production build has an existing chunk-size warning only.
- Browser/mobile theme checks, authenticated Vercel deployment, and live Neon durability tests remain unverified because this environment lacks an approved local server execution path and a `DATABASE_URL`.

## 2026-08-09

### Core workflow restoration and financial safeguards

#### User-facing changes

- Restored the formerly empty **Spending** view. Users can now add, edit, search, and delete transactions for the selected month. Amount `0` remains accepted as a real entered amount; it is not treated as absent data.
- Restored **Recurring activities** management. Users can add, edit, and remove recurring costs, select their category/currency/recurrence, and record monthly or session costs used by budget suggestions and forecasts.
- Restored **Categories**, **Wallet**, **Wishlist**, **Analytics**, **History**, **Scenarios**, and **Settings** screens. These expose the already-existing store capabilities rather than presenting an empty migration notice.
- Added a usable month-close dialog. It explains the calculated month-end delta, requires the user to choose whether that delta enters the wallet, and refuses rollover when a period remains missing instead of coercing missing data to zero.
- Historical months are now read-only for activities, transactions, wishlist items, wallet entries, month closing, and budget approvals. Controls in the active views reflect this restriction.

#### Data-integrity and backend changes

- Added store-level guards around period-bound mutations so navigating to a past month cannot silently change its transactions, close records, or related entries.
- Prevented local duplicate approval writes when the selected period already has an approved budget.
- Changed `PATCH /api/approvals/:id` to reject all writes to an already approved budget. This preserves approved budgets as immutable historical records.
- Updated the JSON-to-database migration helper to await `SnapshotRepository.saveSnapshot`, ensuring the command does not report success before the Neon write completes.
- Corrected the migration helper documentation to name Neon PostgreSQL rather than the retired SQLite implementation.

#### Documentation and maintenance

- Replaced `implementation_plan.md` with a live tracker containing in-progress work, verified completions, remaining work, and discovered issues. It now records that runtime verification is still pending.
- Added the project continuity documents to version control and updated `README.md` plus `docs/AI_CONTEXT.md` with the current implemented scope and the Neon/IndexedDB persistence limitation.

#### Verification and deployment impact

- `git diff --check` passed before commit; no whitespace errors were found.
- Automated tests, frontend build, server build, database persistence checks, and browser/mobile checks were **not run** because Node.js/npm is unavailable in the execution environment.
- No database migration needs to be applied for this client-workflow restoration. A configured `DATABASE_URL` is still required to verify server-side persistence.
- The commit is local until GitHub authentication is available; the repository is one commit ahead of `origin/main`.

## 2026-07-31

### Phase 1 & 2: Neon PostgreSQL Backend Migration
- Fully replaced SQLite (`better-sqlite3`) with Neon PostgreSQL (`@neondatabase/serverless`).
- Updated database schema initialization and created migration `002-add-category-metadata` for `icon`, `description`, and `parent_id` columns.
- Converted `SnapshotRepository` to run async PostgreSQL-compliant queries using `ON CONFLICT (id) DO UPDATE SET ...` syntax.
- Converted `BudgetService` and all Express API routes (`/api/snapshot`, `/api/spending`, `/api/categories`, `/api/activities`, `/api/approvals`) to handle async promises.
- Removed 120-item restriction on budget approvals to preserve approval history indefinitely in database and frontend Zustand store.

### Phase 3: Domain Model & Calculation Enhancements
- Added `icon`, `description`, and `parentId` optional fields to `BudgetCategory` type.
- Added `ignoreNonBudgetSpending` option to `Settings` interface and seed data defaults.
- Updated `summarizeCategories` and `summarizePeriod` calculations in `calculations.ts` to respect non-budget spending filtering while preserving Piloting bucket visibility.

### Phase 4: Commercial Premium UI/UX Refactor
- Refactored single-file presentation into a modular component directory structure (`src/components/dashboard`, `src/components/layout`, `src/components/activity`, `src/components/spending`, `src/components/wishlist`, `src/components/wallet`, `src/components/analytics`, `src/components/categories`, `src/components/scenarios`, `src/components/history`, `src/components/settings`, `src/components/modals`, `src/components/ui`).
- Introduced a brand new Design System (`src/styles.css`) inspired by Apple Wallet, Linear, Notion, and Copilot Money featuring calm neutrals, glassmorphism, responsive grid containers, and smooth micro-interactions.
- Added dedicated `MobileNav` bottom bar for mobile devices and small screens.
- Enhanced Category Manager with custom color picker, description editor, subcategory assignment, and drag-and-drop reordering.
- Added metric cards on Dashboard for burn rate, daily average spending, projected month-end forecast, and projected savings.
- Enhanced historical mode with sticky banner and read-only indicators.

---

## 2026-07-11

- Added local startup support and one-click launch helper for Windows.
- Included `Budget App.lnk` shortcut file in the repository root for easy deployment to Desktop.
- Improved the mobile and tablet UI with responsive layout changes and compact period navigation.
- Added clearer README instructions for running the app locally and accessing it from a phone.
- Verified all existing tests pass and confirmed the production build succeeds.
- Preserved budget calculations, recurring expense logic, and data persistence.

### 2026-07-11 — Launcher & installer (follow-up)
- Added installer script: `scripts/install-launcher.ps1` — copies GUI and batch to Desktop and creates a Desktop shortcut that runs the GUI via PowerShell.
- Enhanced repo launcher with tray icon, port polling timer, LAN auto-open, and balloon notifications: `scripts/launch-gui.ps1`.
- Improved repo batch launcher to auto-open browser and support LAN preview: `scripts/launch-desktop.bat`.
- Local Desktop GUI updated at `C:\Users\iyadf\Desktop\Budget-Launcher-GUI.ps1` (not tracked by default). Use the installer to sync.

### 2026-07-11 — Desktop GUI tracked & local build
- Added repo-tracked copy of Desktop GUI launcher: `scripts/desktop-launcher-gui.ps1`.
- Performed local production build (tsc + vite build); `dist/` produced successfully.
