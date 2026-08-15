# Premium Budget App

A Vite + React budget dashboard focused on fast local use, recurring budget approval, dual-currency analytics, serverless Neon Postgres backend, and mobile-friendly access.

**New in Version 2.0:**
- **Neon PostgreSQL Backend:** Full replacement of SQLite with Neon PostgreSQL serverless database.
- **Commercial Premium UI/UX:** Complete redesign inspired by Apple Wallet, Linear, Notion, and Copilot Money with modular component architecture.
- **Subcategories & Metadata:** Support for subcategories, descriptions, and custom color pickers in Category Manager.
- **Enhanced Metrics:** Dashboard insights including burn rate, daily average spend, projected month-end forecast, and savings.

## What's included

- Monthly budget suggestion based on active recurring costs (excludes Piloting)
- Piloting expenses visible separately and excluded from category-share calculations
- Shared month/week/year selector with ISO-week navigation and a visible historical-data contour across application views
- Modular Dashboard cards for current budget, remaining budget, monthly spending, recurring costs, progress, burn rate, and forecasts
- Compact header controls for month/week/year navigation with keyboard accessibility
- Mobile-responsive layout with bottom navigation bar for phones/tablets
- **Serverless PostgreSQL persistence via Neon** (with automatic IndexedDB fallback for offline use)
- Easy local launch scripts for Windows

## Current implementation status

The main application workflows are implemented in the current React client: recurring activities, transactions, categories, wallet entries, wishlist items, analytics, historical summaries, scenarios, settings, month close, and exports. The header uses one shared period state: calendar year/month for monthly records, and an explicit ISO week-year for weekly records. Historical months, weeks, and years are read-only in the client so viewing the past cannot change period-bound transactions, close records, or approved budgets.

The database is the source of truth; IndexedDB is an offline fallback that is only consulted when the API is unreachable, so a stale local cache cannot overwrite server data. The same account can be used from several devices: each save carries a `revision`, and a write from a device holding outdated data is rejected with `409` rather than silently overwriting the newer version.

### Deployment

Vercel serves the Vite build from `dist/` and routes `/api/*` through `api/[...path].ts`, which exports the same Express app used locally. Set `DATABASE_URL` in the Vercel project before deploying.

**Not yet verified:** no authenticated Vercel deployment has been run from this repository, so production routing and a production `DATABASE_URL` remain unconfirmed. After the first deploy, add a transaction, reload, and confirm it persists.

### Verification status

81 automated tests pass, both builds pass, and the compiled server boots. Persistence has been verified end to end against a live PostgreSQL database from a real browser session, including refresh durability, server-restart durability, and a two-device read/write/conflict cycle. Remaining gaps — the Neon HTTP transport itself and a production Vercel deployment — are tracked in `implementation_plan.md`.

## Architecture

- **Frontend:** Vite + React (TSX), Zustand state management, dependency-free SVG/CSS charts, Lucide icons
- **Backend:** Express.js + Neon PostgreSQL (@neondatabase/serverless), TypeScript
- **Storage:** PostgreSQL (source of truth) + IndexedDB (offline fallback)
- **Deployment:** Vercel — static frontend plus the Express app as a serverless function

## Local development

### Prerequisites

1. Node.js 18+ and npm
2. A PostgreSQL database — either a Neon connection string (`DATABASE_URL`) or any local PostgreSQL server (see *Running against local PostgreSQL* below)

### Run both frontend and backend together

```bash
npm install
npm run dev:all
```

This starts:
- Frontend dev server on `http://localhost:5173`
- Backend API server on `http://localhost:3001`

### Run frontend only (without backend)

```bash
npm install
npm run dev
```

The app will fall back to local IndexedDB storage if the backend API is not available.

### Run backend only

```bash
npm install
npm run server:dev
```

The backend will listen on `http://0.0.0.0:3001` and bind to all network interfaces for LAN access.

### Running against local PostgreSQL (no Neon account needed)

The production driver (`@neondatabase/serverless`) speaks HTTP to Neon and cannot connect to a local server. To develop against any local PostgreSQL instead:

```bash
LOCAL_PG_URL=postgres://postgres@127.0.0.1:5432/budget npm run server:dev:pg
npm run dev    # Vite proxies /api to the API server
```

This runs the real routes, services, and repository — only the driver differs, via the `setDatabase()` seam in `server/src/db/index.ts`.

### Build for production

```bash
npm run build
```

Produces:
- `dist/` — static frontend (deploy to Vercel, Netlify, GitHub Pages, etc.)
- `server/dist/` — backend (deploy to Node.js / Vercel Serverless environment)

## Configuration

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

**Frontend (.env for build time):**
- `VITE_API_URL` — Backend API base URL (default: `/api` for relative paths)

**Backend (runtime):**
- `DATABASE_URL` — Neon PostgreSQL connection string (`postgres://...`)
- `NODE_ENV` — `development` or `production`
- `HOST` — Server host binding (default: `0.0.0.0`)
- `PORT` — Server port (default: `3001`)

## Development scripts

- `npm run dev` — Frontend dev server (Vite; proxies `/api` to `localhost:3001`)
- `npm run server:dev` — Backend dev server against Neon (`DATABASE_URL`)
- `npm run server:dev:pg` — Backend dev server against local PostgreSQL (`LOCAL_PG_URL`)
- `npm run dev:all` — Frontend and backend together
- `npm run build` — Build the frontend
- `npm run server:build` — Typecheck and emit the backend
- `npm run server:prod` — Run the compiled backend
- `npm test` — Run the test suite
- `npm run test:db` — Run the PostgreSQL integration suites (needs `TEST_DATABASE_URL`)

## Testing

```bash
npm test
```

Covers value handling (0 is a real value; null/NaN mean missing), currency conversion determinism, historical immutability, budget calculations (piloting separation, rollover, suggestions), ISO week and period semantics, and the shared analytics selectors.

### Database integration tests

```bash
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget npm run test:db
```

These run the real schema, migrations, repository SQL, and the Express API against a live PostgreSQL server — covering transaction rollback, boolean round-trips, approval immutability, the 409 conflict path, and zero-preservation.

They are worth running before trusting any persistence change: a mocked driver accepts SQL that real PostgreSQL rejects, which is how five live defects previously went unnoticed.
