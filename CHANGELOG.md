# Changelog

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
