# Budget OS

A personal finance application for tracking a real monthly budget: spending, recurring commitments, categories with caps, a wishlist, a wallet, and analytics that explain where the money went — visually, not as a wall of numbers.

It is a single-user product designed to be used from more than one device against one shared database.

---

## What it does

**Budgeting.** A monthly budget in a currency you choose, plus a suggested budget derived from your active recurring expenses (rounded up to the nearest hundred). Suggestions are proposed, never applied: you approve or reject, and an approval becomes a permanent record.

**Spending.** Transactions with amount, currency, date, category, funding source (own budget / outside budget / someone else paid), recurrence, notes, and an optional link to a wishlist item.

**Recurring activities.** Commitments with flexible cost models — a fixed monthly amount, a price per session times sessions per month, or a real weekday/day-of-month schedule that counts actual occurrences in each calendar month (some months genuinely have five Mondays).

**Categories.** Colour, icon, parent, notes, and an optional monthly cap that is tracked and reported when exceeded. Archiving hides a category from new entries while preserving every existing transaction.

**Periods.** Month, ISO week, and year. Historical periods are read-only by default and can be unlocked deliberately, with every change recorded in the audit trail.

**Analytics.** Chart-led: spending trend, budget vs actual with a labelled budget line, cumulative forecast against the budget ceiling, category bars with cap markers, category evolution, a recurring/one-off split, a daily spending heatmap, and period comparisons.

**Reports.** Printable monthly and annual reports, generated from the same calculations as the screen.

**Currencies.** Display currency plus live exchange rates with a manual override and offline fallback. Conversion is presentation-only: stored amounts are never rewritten.

---

## Financial rules

These are enforced in code and covered by tests. They are the reason the app can be trusted with real numbers.

1. **`0` is a real value.** A recorded zero is never treated as missing.
2. **Missing data stays missing.** A period with no records renders as `?` or "No data" — never as a fabricated `0`. Charts break the line rather than drawing through a gap.
3. **History is immutable by default.** Editing a closed period requires an explicit, warned unlock, and every such change is flagged in the audit trail.
4. **Approved budgets are decision records.** They stay immutable even while a period is unlocked for editing.
5. **Currency conversion is display-only.** Stored values are never converted in place.
6. **Piloting stays visible but is excluded** from category share percentages, so it cannot distort ordinary spending distribution.

---

## Architecture

```
React (Vite, TypeScript)
        │
   Zustand store ──────────── IndexedDB (offline cache only)
        │
   REST API (fetch)
        │
   Express app  ── local: server/src/index.ts
        │        └─ Vercel: api/[...path].ts (same app)
        │
   SnapshotRepository
        │
   PostgreSQL (Neon in production)
```

The whole document is one `BudgetSnapshot`. Reads and writes go through `GET`/`PUT /api/snapshot`; the per-entity REST routes exist and are validated but are not on the client's write path today.

**All financial figures come from `src/domain/analytics.ts`.** The Dashboard and Analytics page are presentation over those shared selectors — no component computes its own totals. Charts live in `src/components/charts/` and are dependency-free SVG.

### Synchronization

The server is authoritative whenever it is reachable. IndexedDB is an explicit offline cache, never a silent equal.

Writes are a compare-and-swap on `baseRevision` — the revision this client last read from the server:

```
Device A                       Server                      Device B
  read  → baseRevision = 7
  write (base 7)            →  stored 7 → accept, assign 8
                                                        ← read → base 8
                               stored 8 → reject base 7 with 409 + snapshot
  adopt server snapshot     ←
```

The server assigns the revision; a client cannot inflate it. This is what stops a device that edited while offline from returning with a higher counter and overwriting the other device's work.

The UI always states where the data stands: **Saved**, **Saving…**, **Offline — this device only**, **Sync conflict**, or **Sync failed**, with a Retry action. An unreachable server is never presented as a successful save. Returning to a tab re-checks the server revision, so another device's change appears without a manual reload.

---

## Local development

### Prerequisites

- Node.js 18+ and npm
- A PostgreSQL database — a Neon connection string, or any local PostgreSQL (see below)

### With Neon

```bash
npm install
cp .env.example .env          # set DATABASE_URL
npm run dev:all               # frontend on :5173, API on :3001
```

### With local PostgreSQL (no Neon account)

The production driver (`@neondatabase/serverless`) speaks HTTP to Neon and cannot target a local server. `setDatabase()` in `server/src/db/index.ts` accepts any driver with the same shape, which is what the local launcher uses:

```bash
LOCAL_PG_URL=postgres://postgres@127.0.0.1:5432/budget npm run server:dev:pg
npm run dev                   # Vite proxies /api to it
```

Every route, service, and repository runs exactly as in production; only the driver differs.

---

## Configuration

**Frontend (build time)**
- `VITE_API_URL` — API base URL (default `/api`)

**Backend (runtime)**
- `DATABASE_URL` — PostgreSQL/Neon connection string
- `NODE_ENV`, `HOST` (default `0.0.0.0`), `PORT` (default `3001`)

**Development helpers**
- `LOCAL_PG_URL`, `PG_SCHEMA` — for `server:dev:pg`
- `TEST_DATABASE_URL` — enables the database integration suites

No secret is ever needed in the browser. Exchange rates come from a keyless public endpoint; if a keyed provider is adopted, the call must move behind a server route.

---

## Deployment (Vercel)

Vercel serves the Vite build from `dist/` and routes `/api/*` through `api/[...path].ts`, which exports the same Express app used locally. Set `DATABASE_URL` in the Vercel project before deploying. The schema is created and migrated automatically on first request.

**Not yet verified:** no authenticated deployment has been run from this repository, so production routing and a production `DATABASE_URL` are unconfirmed. After the first deploy, check `GET /api/health` — it answers `{"status":"ok","database":"connected"}` when healthy and `503 degraded` with the reason when not, so a misconfigured database is distinguishable from a dead server.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Frontend dev server (proxies `/api` to `localhost:3001`) |
| `npm run server:dev` | API against Neon (`DATABASE_URL`) |
| `npm run server:dev:pg` | API against local PostgreSQL (`LOCAL_PG_URL`) |
| `npm run dev:all` | Frontend and API together |
| `npm run build` | Build the frontend |
| `npm run server:build` | Typecheck and emit the backend |
| `npm run server:prod` | Run the compiled backend |
| `npm test` | Test suite |
| `npm run test:db` | PostgreSQL integration suites (needs `TEST_DATABASE_URL`) |

---

## Testing

```bash
npm test
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget npm run test:db
```

Domain and store tests cover period/ISO-week semantics, currency conversion, analytics selectors, schedule maths, historical guards, chart scales, reports, and exchange-rate handling.

The integration suites run the real schema, migrations, repository SQL, and the Express API against a live PostgreSQL server, including transaction rollback, the 409 conflict path, and a simulated two-device exchange. They are worth running before trusting any persistence change: a mocked driver accepts SQL that real PostgreSQL rejects, which is how several live defects previously went unnoticed.

---

## Current limitations

- **No production deployment has been verified** (see above).
- **The Neon HTTP transport itself is not exercised by tests** — the SQL is verified against real PostgreSQL through an equivalent driver interface, but Neon's own wire protocol, notably `sql.transaction([...])`, is assumed.
- **No automated browser tests.** UI behaviour is verified manually; a Playwright suite is the obvious next step.
- **Import is unreachable from the UI.** Export works; the import functions exist but no component calls them.
- Further open items are tracked in `implementation_plan.md` and `docs/KNOWN_ISSUES.md`.

---

## Documentation

| File | Contents |
| --- | --- |
| `implementation_plan.md` | The live engineering tracker — the honest state of the project |
| `docs/ARCHITECTURE.md` | Layers, sync model, analytics layer, driver seam |
| `docs/DATABASE.md` | Schema, migrations, persistence guarantees |
| `docs/API.md` | Routes, error semantics, concurrency protocol |
| `docs/DESIGN_SYSTEM.md` | Typography, colour, charts, components |
| `docs/TESTING.md` | Test layers and how to run them |
| `docs/KNOWN_ISSUES.md` | Open problems and technical debt |
| `CHANGELOG.md` | What changed and why |

`implementation_plan.md` is the single live tracker. A task is ticked only when it is implemented **and** verified.
