# Budget OS

A personal finance application for tracking a real monthly budget: spending, recurring commitments, categories with caps, a wishlist, a wallet, and analytics that explain where the money went — visually, not as a wall of numbers.

Each account holds its own budget, and one account can be used from as many devices as you like against one shared database.

---

## What it does

**Budgeting.** A monthly budget in a currency you choose, plus a suggested budget derived from your active recurring expenses (rounded up to the nearest hundred). Suggestions are proposed, never applied: you approve or reject, and an approval becomes a permanent record.

**Spending.** Transactions with amount, currency, date, category, recurrence, notes, an optional link to a wishlist item, and **who paid**. A transaction somebody else paid for is recorded at full value and stays visible, but never counts against your budget — see the funding rule below.

**Recurring activities.** Commitments with six cost models:

| Model | For |
| --- | --- |
| Fixed monthly | A flat amount, whatever the calendar does |
| Per session | A session price times the sessions you expect each month |
| Per session, paid in blocks | Sessions at one rate, paid at another — twice a week, settled every ten sessions |
| Real schedule | A session price times the occurrences that truly fall in each month (some months genuinely have five Mondays) |
| Fixed yearly | A real annual payment on a real date |
| Automatic | Inferred from the recurrence type, for records that predate cost models |

The last two exist because **when money leaves is a different question from what something costs per month**. Two sessions a week is not two payments a week, and €60 a year is not €60 a month. Monthly figures for those models are accruals and are labelled `avg.`; the payments are a separate dated series, and the app never manufactures a monthly charge for an annual one.

A next-renewal date states what no rule can derive — the day an annual subscription was bought, or when the next block of sessions falls due. For the two payment-cycle models it is the schedule baseline: give it 14 September 2026 and the charges are 14 September 2026, 2027, 2028. Without one, the activity is reported as undated rather than placed on a guessed date. One-off exceptions (skip, move, add, reprice) override a single occurrence without touching the rule.

**Wishlist.** Product, price, currency, priority (`Dream` is the *lowest*), category, notes, colour, an icon, and two separate links: where it is **bought** and whose **brand** the icon should come from. They are different facts — an add-on sold on one store and built by another — so using one field for both forced a choice between an item that looks right and an item that buys right. Marking an item bought can create the matching transaction, and creating a transaction can mark the item bought; neither can produce a duplicate.

**Scenarios and seasons.** A scenario stores a budget, the piloting rule and category caps, and applies behind a preview of every value that will change. A season stores which activities are running and what they cost — lessons stop over the summer, heating stops in June — and is created by capturing the arrangement you are already looking at.

**Categories.** Colour, icon, parent, notes, and an optional monthly cap that is tracked and reported when exceeded. Archiving hides a category from new entries while preserving every existing transaction.

**Periods.** Month, ISO week, and year. Historical periods are read-only by default and can be unlocked deliberately, with every change recorded in the audit trail.

**Analytics.** Chart-led: spending trend, budget vs actual with a labelled budget line, cumulative forecast against the budget ceiling, category bars with cap markers, category evolution, a recurring/one-off split, a daily spending heatmap, and period comparisons.

**Reports.** Printable monthly, annual and **custom-range** reports, generated from the same calculations as the screen. A custom range deliberately carries no budget or remaining figure: the budget is set per month, and prorating one across six weeks would be a number nobody chose.

**Currencies.** Display currency plus live exchange rates with a manual override and offline fallback. Conversion is presentation-only: stored amounts are never rewritten. You choose which currencies the app offers, so a budget in two currencies is not asked to pick from ten — but the display currency, and any currency real records are denominated in, can never be untracked.

**Accounts.** Email and password sign-in with revocable sessions. Every account starts with an empty budget of its own — no demo data, and no adoption of anyone else's. Passwords are hashed with scrypt; sessions are opaque tokens stored hashed, so a database read cannot impersonate anyone. Signing in, changing your address and changing your password are all rate-limited or password-checked.

**A dashboard you arrange.** Seven sections, each shown or hidden and moved up or down, stored with your budget so the arrangement follows you between devices. The health score and headline figures cannot be hidden: a dashboard with no figures on it is a blank page, not a simpler one.

**Import.** An existing spreadsheet or a JSON backup can be loaded from Settings. The import states exactly what it found and what will be replaced before anything is written.

---

## Financial rules

These are enforced in code and covered by tests. They are the reason the app can be trusted with real numbers.

1. **`0` is a real value.** A recorded zero is never treated as missing.
2. **Missing data stays missing.** A period with no records renders as `?` or "No data" — never as a fabricated `0`. Charts break the line rather than drawing through a gap.
3. **History is immutable by default.** Editing a closed period requires an explicit, warned unlock, and every such change is flagged in the audit trail.
4. **Approved budgets are decision records.** They stay immutable even while a period is unlocked for editing.
5. **Currency conversion is display-only.** Stored values are never converted in place.
6. **Piloting stays visible but is excluded** from category share percentages, so it cannot distort ordinary spending distribution.
7. **Money somebody else spent is not yours to have spent.** A transaction marked *Someone else paid* or *Outside my budget* keeps its full amount and stays in the ledger, and is excluded from every figure that answers "how am I doing against my budget" — remaining, utilisation, burn rate, forecast, category totals and caps, health, period comparisons, the year and year-to-date totals, and the reports. Budget €1,000, personal €300, external €200 leaves **€700**, not €500. This is not a setting; it lives in `src/domain/funding.ts` and every budget selector filters through it.

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
        │        └─ Vercel: api/index.ts (same app)
        │
   SnapshotRepository
        │
   PostgreSQL (Neon in production)
```

The whole document is one `BudgetSnapshot`. Reads and writes go through `GET`/`PUT /api/snapshot`; the per-entity REST routes exist and are validated but are not on the client's write path today.

**All financial figures come from `src/domain/analytics.ts`.** The Dashboard and Analytics page are presentation over those shared selectors — no component computes its own totals. Charts live in `src/components/charts/` and are dependency-free SVG, with 1/2/5 × 10ⁿ tick spacing and a labelled budget reference line.

**Rules that must not be expressible twice** get a leaf module of their own, imported by everything that needs them and depending on nothing: `src/domain/funding.ts` (who paid), `src/domain/schedule.ts` (occurrences and overrides), `src/domain/dashboard.ts` (which sections appear). When a rule lives in one place, no view can honour a version of it that another view ignores.

**One editor shell.** `src/components/ui/EditorSheet.tsx` is a centred dialog on a desktop and a full-screen sheet on a phone, and it is what Activities, Spending, Wishlist, Categories, Scenarios and the dashboard customiser all use. Its set-up effect deliberately depends on nothing: an earlier version listed `onClose`, which every caller passes fresh, so it re-ran on every keystroke and moved focus back to the first field. `tests/editor-typing.test.tsx` types a long name one character at a time and asserts focus and caret after each one.

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
- `CORS_ORIGIN` — comma-separated allowed origins for browser requests. Cookies require an explicit origin; `*` is rejected by browsers when credentials are sent
- `CORS_ALLOW_VERCEL_PREVIEWS` — when `"true"`, any `*.vercel.app` origin may call the API. Off by default
- `PUBLIC_APP_URL` — the base a password-reset link is built from. Never the `Host` header, which an attacker controls
- `RESEND_API_KEY`, `MAIL_FROM` — sending password-reset email. Without them a reset link is logged by the server rather than sent, which is usable in development and useless in production
- `SIGNUP_INVITE_CODE` — when set, signup additionally requires this code

**Development helpers**
- `LOCAL_PG_URL`, `PG_SCHEMA` — for `server:dev:pg`
- `TEST_DATABASE_URL` — enables the database integration suites

No secret is ever needed in the browser. Exchange rates come from a keyless public endpoint; if a keyed provider is adopted, the call must move behind a server route.

---

## Deployment (Vercel)

Vercel serves the Vite build from `dist/` and routes `/api/*` through `api/index.ts` — an explicit rewrite in `vercel.json`, not the filename-based catch-all. A `[...path].ts` catch-all was tried first and never matched a path with more than one segment, which killed every route below `/api/x` in production while single-segment routes worked; the explicit rewrite is what fixed it.

Set `DATABASE_URL` in the Vercel project — in each environment you deploy, not only Development — before deploying. The schema is created and migrated automatically on first request.

After a deploy, `GET /api/health` answers `{"status":"ok","database":"connected"}` when healthy and `503 degraded` with the reason when not, so a misconfigured database is distinguishable from a dead server.

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
| `node scripts/build-icons.mjs` | Regenerate every icon from `assets/brand/air-france-fin.jpg` (needs ImageMagick; the outputs are committed) |

---

## Testing

```bash
npm test
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/budget npm run test:db
```

Domain and store tests cover period/ISO-week semantics, currency conversion, analytics selectors, schedule maths, historical guards, chart scales, reports, and exchange-rate handling.

The integration suites run the real schema, migrations, repository SQL, and the Express API against a live PostgreSQL server, including transaction rollback, the 409 conflict path, and a simulated two-device exchange. They are worth running before trusting any persistence change: a mocked driver accepts SQL that real PostgreSQL rejects, which is how several live defects previously went unnoticed.

---

## Interface

**Air France-inspired, not Air France.** Deep navy chrome, refined blue, the signature red used as a mark rather than a colour, French-editorial type and a lot of whitespace. A small centred tricolour signs the top of the app, in three fixed colours that do not follow the theme — a flag whose middle band disappears in dark mode is a broken rule, not a flag. On a phone — where there is no sidebar to carry the identity — the header becomes a full-bleed navy band, because otherwise the identity was in practice desktop-only.

**The mark is the supplied A350 fin artwork**, mastered once at `assets/brand/air-france-fin.jpg` and derived into every size by `scripts/build-icons.mjs`. Home-screen icons keep the artwork's own margin; tab icons are cropped to the fin, because at 16px that margin is width the shape cannot spare. Clicking the mark beside "Budget OS" collapses and expands the sidebar.

**Your colours are yours.** The identity applies to the application's own chrome. A green activity stays green, a purple category stays purple, a custom wishlist colour stays custom; nothing recolours user-chosen entities.

**Motion, in one direction.** Changing tab moves the whole application: a navy plane covers the viewport, a route draws between two waypoints with an airliner along it, and the incoming page arrives behind it. Period changes slide the same way. Both used to mirror the direction of travel; they no longer do, because a motion whose direction changes is a second thing to read on every navigation — and because the sweep and the page derived their directions separately, so half the time the aircraft flew one way and the page the other. Everything is transform and opacity, and **all of it is skipped under `prefers-reduced-motion`** — the page still changes, it simply appears.

**The period selector** is a bar under the header: Week / Month / Year, one step either way, the period and its range, today's date, and one button back to the current period. Jumping to an arbitrary period opens a month grid and a year stepper. In a historical period the app adds a dashed contour and an opaque navy banner, both of which sit *below* the selector and neither of which can take a press aimed at it.

**Tap to edit, swipe for an action.** Tapping a wishlist item, activity, transaction, category or scenario opens its editor. Swiping a row *reveals* its actions rather than performing them: the row tracks the finger to the panel edge, rubber-bands past it, and arms at 150px of travel, at which point releasing acts. The revealed controls are real buttons in the DOM at all times, so nothing is available only to a finger, and which action sits on each side is configurable.

**Accessibility.** Every interactive control on every tab has an accessible name; no target is under 24px; status is never carried by colour alone; modals trap focus and restore it; and the text palette is measured rather than eyeballed — a scripted sweep composites the real background behind every text node on all ten tabs in both themes and asserts WCAG AA. It currently reports zero failures. The sweep composites **gradients** as well as background colours: an earlier version read the colour alone, scored every tinted card against the page behind it, and reported zero while six real failures were on screen.

---

## Performance

First load is four cached chunks rather than one:

| Chunk | Raw | Gzipped | Changes when |
| --- | --- | --- | --- |
| `index` (application) | 442 kB | 96 kB | every deploy |
| `react` | 330 kB | 101 kB | React is upgraded |
| `icons` | 142 kB | 29 kB | the icon library changes |
| `xlsx` | 430 kB | 143 kB | **loaded only when a spreadsheet is imported** |

Analytics, Scenarios, History, Categories and Settings are separate chunks, fetched when the browser is idle so a tab switch is instant rather than paying the cost at the moment the transition plays.

---

## Current limitations

- **The Neon HTTP transport itself is not exercised by tests** — the SQL is verified against real PostgreSQL through an equivalent driver interface, but Neon's own wire protocol, notably `sql.transaction([...])`, is assumed.
- **Almost no automated browser tests.** `tests/editor-typing.test.tsx` covers the editor's focus behaviour under jsdom; everything else is verified by hand in a real browser at 320px, 390px and 1440px. A Playwright suite is the obvious next step.
- **`xlsx@0.18.5` carries two high-severity advisories** with no fix published to the npm registry. It is loaded on demand, only for a file the user chose themselves, and never runs on the server.
- **Password-reset email needs a verified sender.** Without `RESEND_API_KEY` and a verified domain, the reset link is written to the server log instead of being sent.
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
