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
- Distinctive historical period banner for past months/weeks with preserved values
- Modular Dashboard cards for current budget, remaining budget, monthly spending, recurring costs, progress, burn rate, and forecasts
- Compact header controls for month/week/year navigation with keyboard accessibility
- Mobile-responsive layout with bottom navigation bar for phones/tablets
- **Serverless PostgreSQL persistence via Neon** (with automatic IndexedDB fallback for offline use)
- Easy local launch scripts for Windows

## Current implementation status

The main application workflows are implemented in the current React client: recurring activities, transactions, categories, wallet entries, wishlist items, analytics, historical summaries, scenarios, settings, month close, and exports. Historical months are read-only in the client so viewing the past cannot change recorded transactions, close records, or approved budgets.

Neon remains the intended remote source of truth and IndexedDB is retained as an offline fallback. A working `DATABASE_URL` and a Node.js 18+ runtime are required to verify the API persistence path.

### Deployment

Vercel deploys the Vite build from `dist/` and routes `/api/*` requests through `api/[...path].ts`, which exports the same Express application used locally. Configure `DATABASE_URL` in Vercel before deployment. The configuration and function entrypoint compile locally, but an authenticated Vercel preview and a Neon persistence cycle are still required before treating deployment as verified.

### Verification status

The repository includes calculation safety tests, but the current implementation has not yet been runtime-verified in this environment because Node.js/npm is unavailable. Before deploying, run the test and build commands below, then verify database persistence by changing data, refreshing the app, and restarting the server. The live implementation tracker contains the remaining verification tasks.

## Architecture

- **Frontend:** Vite + React (TSX), Zustand state management, Recharts analytics, Lucide icons
- **Backend:** Express.js + Neon PostgreSQL (@neondatabase/serverless), TypeScript
- **Storage:** Neon PostgreSQL database (backend) + IndexedDB (frontend fallback for offline)
- **Deployment:** Vercel / Netlify (Frontend) + Express serverless API (Backend)

## Local development

### Prerequisites

1. Node.js 18+ and npm
2. Neon PostgreSQL Database Connection string (`DATABASE_URL`)

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

- `npm run dev` — Frontend dev server (Vite)
- `npm run server:dev` — Backend dev server (Node.js with tsx)
- `npm run dev:all` — Both frontend and backend together
- `npm run build` — Build frontend + server for production
- `npm run server:build` — Build backend only
- `npm run test` — Run tests (vitest)

## Testing

```bash
npm test
```

Includes safety-net tests for:
- Value handling (0 as valid, null/NaN as missing)
- Currency conversion determinism
- Historical data immutability
- Budget calculations (piloting separation, rollover, suggestions)
