# Implementation Plan - Complete Neon Migration & Budget App Enhancements

We will modify the application's backend to use Neon (PostgreSQL) directly and completely, removing all SQLite dependencies. We will clean up SQLite bloat, enhance categories, spending sources, dashboard UI (for both desktop and mobile), and push all progress incrementally.

## User Review Required

> [!IMPORTANT]
> **Complete Neon Database Migration:** We will completely remove `better-sqlite3` and SQLite-specific logic from the backend. The database will run on PostgreSQL (Neon serverless).
> 
> **Database Environment Variable:** The backend will require `DATABASE_URL` to connect to Neon. We will document this in the updated `README.md`.
> 
> **Mobile UI & Responsive Design:** We will optimize the dashboard and transaction editing forms specifically for small screens with premium touch targets and bottom-bar navigation indicators.

---

## Proposed Changes

### 1. Database & Server Cleanup (Replacing SQLite with Neon)

#### [MODIFY] [client.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/db/client.ts)
* Change database initialization to return the Neon `sql` query client directly.
* Ensure all database calls are async.

#### [MODIFY] [index.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/db/index.ts)
* Remove all imports of `better-sqlite3`.
* Initialize schema and run migrations asynchronously using the Neon serverless client.

#### [MODIFY] [schema.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/db/schema.ts)
* Validate that schema definitions are fully PostgreSQL-compatible (using standard datatypes).

#### [MODIFY] [SnapshotRepository.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/repositories/SnapshotRepository.ts)
* Make all methods asynchronous (`Promise`-based).
* Rewrite all query executions using the Neon template literal style (`sql` queries) or parameterized Neon driver calls.
* Replace SQLite syntax (like `INSERT OR REPLACE`) with PostgreSQL-compliant `ON CONFLICT (id) DO UPDATE SET ...` syntax.
* Remove SQLite-specific operations (like `.prepare()`, `.all()`, `.get()`, synchronous `.transaction()`).
* Remove `LIMIT 120` from approvals to save history forever.

#### [MODIFY] [BudgetService.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/services/BudgetService.ts)
* Change signature to use Neon's query function and make all methods asynchronous.

#### [MODIFY] [package.json](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/package.json)
* Remove `better-sqlite3` and `@types/better-sqlite3` from dependencies and devDependencies.

---

### 2. Express Routes (Awaiting Async Operations)

#### [MODIFY] [snapshot.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/routes/snapshot.ts)
#### [MODIFY] [spending.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/routes/spending.ts)
#### [MODIFY] [categories.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/routes/categories.ts)
#### [MODIFY] [activities.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/routes/activities.ts)
#### [MODIFY] [approvals.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/server/src/routes/approvals.ts)
* Prepend `await` to all service calls.
* Add support for patching `recurrenceType` on transactions.

---

### 3. Domain Model, Calculations & UI Updates

#### [MODIFY] [types.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/src/domain/types.ts) & [types.d.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/src/domain/types.d.ts)
* Add subcategory and custom metadata to `BudgetCategory` (e.g., `icon`, `description`, `parentId`).
* Add `ignoreNonBudgetSpending?: boolean` setting.

#### [MODIFY] [calculations.ts](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/src/domain/calculations.ts)
* Include piloting category entries in `summarizeCategories` but segregate it so it does not affect percentage charts.
* Update budget calculation totals (`totalSpend`, `selectedMonthSpend`) to optionally ignore non-budget spending based on settings and transaction source.

#### [MODIFY] [App.tsx](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/src/App.tsx)
* **Dashboard Redesign:** Clean Notion-style dashboard with high information density, clear hierarchy, and dual-currency (selected + EUR equivalent) displays.
* **Category Manager:** Enable icon picking, description fields, optional parent category assignment, reordering, and archiving.
* **Transaction Editing:** Expand inline transaction editing to include categories, notes, recurrence, and sources.
* **Mobile Layouts:** Optimize sidebar navigation, charts, forms, and touch targets to offer a native-app-like mobile feel.
* **Historical Mode Overlay:** Implement high-visibility past period banner/styling.

---

### 4. Documentation & Clean Up

#### [MODIFY] [README.md](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/README.md)
* Remove references to SQLite database setup.
* Add instructions for configuring Neon database using `DATABASE_URL`.

#### [MODIFY] [CHANGELOG.md](file:///C:/Users/iyadf/.gemini/antigravity/scratch/budgeting-app/CHANGELOG.md)
* Document all changes in the changelog.

---

## Verification Plan

### Automated Tests
- Run `npm run test` to verify calculation logic.
- Run `npm run server:build` and `npm run build` to verify clean production compile.

### Deployment & Git
- Commit logical changes incrementally.
- Push the code to Vercel/GitHub.
