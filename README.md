# Premium Budget App

A Vite + React budget dashboard focused on fast local use, recurring budget approval, dual-currency analytics, and mobile-friendly access.

**New in Phase 1:** Full backend integration with Express + SQLite for persistent data storage beyond client-side IndexedDB.

## What's included

- Monthly budget suggestion based on active recurring costs (excludes Piloting)
- Piloting expenses visible separately and excluded from category-share calculations
- Historical period indicator for past months/weeks with a subtle UI treatment
- Dashboard cards for current budget, remaining budget, monthly spending, recurring costs, and progress
- Compact header controls for month/week/year navigation
- Mobile-responsive layout and charts for phones/tablets
- **Backend persistence via SQLite** (with automatic IndexedDB fallback for offline use)
- Easy local launch scripts for Windows

## Architecture

- **Frontend:** Vite + React (TSX), Zustand state management, Recharts charts
- **Backend:** Express.js + SQLite (better-sqlite3), TypeScript
- **Storage:** SQLite database (backend) + IndexedDB (frontend fallback for offline)
- **Deployment:** Static frontend (GitHub Pages/Netlify) + separate backend with persistent database

## Local development

### Prerequisites

1. Node.js 18+ and npm

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
- `dist/` — static frontend (deploy to GitHub Pages, Netlify, etc.)
- `server/dist/` — backend (deploy to a Node.js hosting platform)

### Run production build

```bash
# Frontend preview
npm run preview

# Backend production
npm run server:prod
```

### Database management

The backend uses SQLite with automatic schema initialization on first run.

**Database location:** `data/budget.db` (or set `DB_PATH` environment variable)

#### Import existing data

If you have a JSON backup from the app:

```bash
npm run server:dev &
npx tsx server/src/migrate.ts path/to/backup.json
```

This imports your existing budget data into the SQLite database.

## Phone access (LAN)

With the backend running:

1. Run `npm run dev:all` (or `npm run server:dev` for backend-only)
2. Find your PC's IP address on the local network
3. From your phone browser, open:
   ```
   http://<your-pc-ip>:5173
   ```

For remote access outside your network, use a secure tunnel tool such as `ngrok` or `localtunnel`.

## Deployment

### Option 1: Frontend + Backend on same server

- Deploy static frontend to a CDN (GitHub Pages, Netlify, Vercel)
- Deploy backend to Node.js hosting (Heroku, Railway, Render, etc.)
- Configure frontend API URL with environment variable:
  ```
  VITE_API_URL=https://api.example.com
  ```

### Option 2: Backend only on private server

- Deploy frontend as static files on private server
- Deploy backend on the same server or private network
- Set `CORS_ORIGIN` on backend to match frontend domain

## Configuration

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

**Frontend (.env for build time):**
- `VITE_API_URL` — Backend API base URL (default: `/api` for relative paths)

**Backend (runtime):**
- `NODE_ENV` — `development` or `production`
- `HOST` — Server host binding (default: `0.0.0.0`)
- `PORT` — Server port (default: `3001`)
- `DB_PATH` — SQLite database path (default: `data/budget.db`)
- `CORS_ORIGIN` — Comma-separated list of allowed origins for CORS

## Development scripts

- `npm run dev` — Frontend dev server (Vite)
- `npm run server:dev` — Backend dev server (Node.js with tsx)
- `npm run dev:all` — Both frontend and backend together
- `npm run build` — Build frontend + server for production
- `npm run server:build` — Build backend only
- `npm run test` — Run tests (vitest)
- `npm run test:watch` — Watch mode for tests

## Testing

```bash
npm test
```

Includes safety-net tests for:
- Value handling (0 as valid, null/NaN as missing)
- Currency conversion determinism
- Historical data immutability
- Budget calculations (piloting separation, rollover, suggestions)

## Notes

- Existing budget data is preserved through IndexedDB and can be migrated to SQLite using the migration tool
- The app works offline with IndexedDB if the backend is unavailable
- All calculation and UI logic remains in the frontend; the backend is a thin persistence layer
- Database schema is Postgres-friendly for future migration if needed

