# Changelog

## 2026-08-10

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
