# Live implementation plan

This is the active engineering tracker. A checkbox is ticked only after implementation **and** the relevant verification have both succeeded. "The code exists" is never sufficient.

**Last updated:** 2026-08-16 — accounts, production, Excel import, identity and interaction pass. **Production is live and verified**: `/api/health` returns `{"status":"ok","database":"connected"}`, `/api/auth/me` answers 200, and every budget route returns 401 without a session. 421 tests, 65 of them against a real PostgreSQL 17 server.

## How this session verified things

- **Real PostgreSQL.** A local PostgreSQL 17 instance. The Neon driver speaks HTTP to Neon only, so `setDatabase()` injects a node-postgres adapter with the same interface; the SQL under test is byte-for-byte what production sends.
- **Real browser.** Chrome DevTools drove the running app against that database — two isolated contexts as two devices, touch emulation for gestures, and a deliberate server shutdown for offline behaviour.
- **Real production.** `curl` against the deployed Vercel URL for routing, health, and the authentication guard.

Anything that could not be verified this way is under *Not verified* and stays unticked.

## In progress / next

- [ ] Dedicated editors for **spending**, **categories** and **wishlist** — the shell (`EditorSheet`) exists and activities use it; the other three panels still edit inline.
- [ ] Expand the icon library toward the named product/brand set (flight-sim, streaming, gaming, sports). The picker is searchable and categorised, and wishlist items can now draw an icon from a brand domain, but the curated library is still the base Lucide set.
- [ ] Gesture preferences in Settings (which action each direction performs).
- [ ] Autosave mode with an editable change summary. Manual save and explicit sync state exist; autosave does not.
- [ ] Exercise the Neon HTTP driver's `sql.transaction([...])` specifically. Production now runs on it, but no test drives it directly.
- [ ] Automate the browser checks (Playwright). Everything marked "browser-verified" was checked by hand.

## Completed — accounts and production (2026-08-16)

### Production

- [x] **Production is live.** `/api/health` → `{"status":"ok","database":"connected"}`; one-, two- and three-segment API paths all reach the Express app; guarded routes return 401 without a session (2026-08-16; verified with `curl` against the deployed URL).
- [x] Vercel routing fixed. `api/[...path].ts` was published as a single-segment route because Vercel compiles `[...param]` to `([^/]+)`, so `/api/spending/:year/:month` could never be reached. Renamed to `api/index.ts` with an explicit rewrite (2026-08-16; measured in production, no `x-vercel-error` on any path).
- [x] Health reports which connection-string variables the runtime can see — names and booleans only, never a value (2026-08-16).
- [x] `scripts/push-env-to-vercel.sh` copies secrets from `.env` without printing them (2026-08-16).
- [x] Three always-failing deploy workflows replaced by one CI that typechecks, tests against a PostgreSQL 17 service container, builds both targets, and boots the compiled server (2026-08-16).

### Tenant isolation — prerequisites for accounts

- [x] **`budget_approvals` had no owner column** and was read with no `WHERE` clause, so every budget would have loaded every other budget's permanent financial records. Migration `006` (2026-08-16; integration-tested).
- [x] **Every seed identifier was hardcoded**, and those are primary keys in shared tables, so the second budget created took over the first one's rows. Ids are generated per budget; `seedKey` carries the stable identity (2026-08-16; the four isolation tests fail against the previous code).
- [x] Category deletion was ordered before the rows referencing it, so replacing a budget's category set aborted the transaction on a `RESTRICT` foreign key — what an import or a reset does (2026-08-16).
- [x] Every `ON CONFLICT` carries an owner guard, so a cross-budget id collision is a no-op rather than silent corruption (2026-08-16).
- [x] **`initializeSchema` must not reference a column a later migration adds.** It runs first, so on an existing database the column does not exist yet; this took the API down with 503 on every request. Found by booting the compiled server against a database with data (2026-08-16; new "upgrading an existing database" suite).

### Authentication

- [x] Email and password, scrypt via `node:crypto`, cost parameters stored inside each hash so raising them does not invalidate anyone (2026-08-16).
- [x] Opaque revocable sessions stored hashed, `HttpOnly`/`SameSite=Lax`, expiry compared in the database (2026-08-16).
- [x] One-time password reset, 30 minutes, claimed with an atomic conditional update; links built from `PUBLIC_APP_URL`, never from the `Host` header (2026-08-16).
- [x] No account enumeration: sign-in and forgot-password answer identically regardless of whether the address exists (2026-08-16; asserted by comparing the two responses).
- [x] Database-backed rate limiting on sign-in (email **and** IP) and reset (2026-08-16).
- [x] CORS is an allowlist. It was `origin: "*"` with `credentials: true`, which browsers reject outright — the session cookie would never have been sent (2026-08-16).
- [x] The offline cache is keyed per account, cleared entirely on sign-out, and a 401 is a distinct error the store refuses to serve from cache (2026-08-16; browser-verified).
- [x] **A new account starts empty**, not on the demo fixture, and does not adopt any pre-existing budget (2026-08-16).
- [x] `scripts/create-account.ts` for bootstrapping and recovery; relaxes the password minimum only against a localhost database (2026-08-16).

### Excel import

- [x] **Rewritten around header detection.** The previous version addressed cells by fixed row number while reading with `blankrows: false`; measured against the real workbook it lost two activities, two wishlist items, ten weeks of spending and four of five years, and read the balance as 0 because the cell says "€339.39" (2026-08-16; 25 tests plus a full browser round trip).
- [x] Missing stays missing; `0` is kept; failures name what was wrong instead of falling back to the first sheet or to the seed's own activities (2026-08-16).
- [x] Import shows what it will **destroy** first — before/after counts, the years that will be deleted, a backup, and a confirmation — and lands on the undo stack (2026-08-16; browser-verified including undo).
- [x] Reachable from **Settings → Data** and from the sidebar (2026-08-16).
- [x] Both link fields stopped using `type="url"`: the browser demanded a scheme and silently blocked what the placeholder suggested (2026-08-16).

### Identity, interaction and performance

- [x] Air France-inspired palette: deep navy interface, the signature red as a mark only. User-chosen colours untouched (2026-08-16).
- [x] `--accent-contrast`, because a fixed white label fails on a light accent in dark mode; the brand mark uses fixed values so a logo does not follow the theme (2026-08-16).
- [x] **First load 1,216 kB → 739 kB** (gzip 276 → 188). `xlsx` loads on demand; Analytics, Scenarios, History, Categories and Settings load when opened (2026-08-16; measured).
- [x] "Upcoming recurring" replaced by a dated timeline. Activities with no schedule are **not** given invented dates (2026-08-16; 12 tests).
- [x] One-off schedule exceptions — skip, move, extra, price — combined in a single function so no view can honour an override that another ignores. `calculations.ts` unchanged (2026-08-16; 19 tests plus persistence round trip).
- [x] Scenarios: create, edit, duplicate, delete, and **apply behind a preview** showing every value that changes (2026-08-16; 12 tests, browser-verified).
- [x] Purchase link and brand link separated, so the icon can be the maker while the link still opens the shop (2026-08-16; migration `009`).
- [x] Swipe actions that **reveal** rather than act, with the revealed buttons always in the DOM as the accessible alternative (2026-08-16; browser-verified with touch emulation).
- [x] Dedicated editor shell — dialog on desktop, full-screen sheet on mobile — with progressive disclosure; activities use it, and the whole card opens it (2026-08-16).
- [x] The period selector is a collapsed widget rather than a permanent strip, and marks a historical selection without being opened (2026-08-16).
- [x] Icon-only buttons had no accessible name: `title` alone is a mouse tooltip that several screen readers ignore (2026-08-16).
- [x] `.text-footnote` uppercases its content; a `.text-note` class now carries sentence-case prose (2026-08-16).
- [x] Tab transition restored — code splitting had left the animation playing over the loading placeholder while the real content arrived without remounting (2026-08-16; verified in the browser).

## Not verified

- [ ] Multi-device sync **in production**. Verified locally against PostgreSQL with two isolated contexts; the production instance has no data in it yet.
- [ ] Live exchange rates against the real provider from the production runtime.
- [ ] Print/PDF output of the reports on a real printer dialog.

## Actions needed from the repository owner

- [ ] `RESEND_API_KEY` and a verified sender domain, for password-reset email. Everything else works without it, and `forgot-password` deliberately answers the same either way.
- [ ] Decide whether preview deployments should be allowed to call the API (`CORS_ALLOW_VERCEL_PREVIEWS`).
- [ ] Optionally set `SIGNUP_INVITE_CODE` — without it, anyone who finds the URL can create an account.

## Discovered issues

 — open

- [ ] **Back-dating from the current period** is still permissive by design: a transaction can be dated into a past month while viewing the current one. Late receipt entry is legitimate, and a dedicated audited path exists for rewriting a closed period.
- [ ] **The granular REST routes are not on the live write path.** The client persists only through `GET`/`PUT /api/snapshot`; the per-entity routes are implemented and validated but unused, so their validation constrains nothing today.
- [ ] `PATCH /api/snapshot/settings` spreads the request body with no per-field validation.
- [ ] **Import is unreachable.** `importBudgetWorkbook` and `importJsonBackup` exist but no component calls them and there is no file input anywhere. Export works, so data can leave but not return.
- [ ] **Seasonal presets are unreachable.** `applySeasonalPreset` is implemented and seeded but called from nowhere; it is also the only writer of `settings.selectedSeason`.
- [ ] `ScenarioLab` applies presets destructively with no preview, and presets cannot be created, edited, or deleted.
- [ ] Wishlist totals sum `actualPrice` across mixed currencies without conversion.
- [ ] `POST /api/snapshot/reset` is a stub that reports success without doing anything.
- [ ] Four settings are seeded but read by no code path: `autoWalletRollupEnabled`, `promptBeforeMonthClose`, `liveClockEnabled`, `nanPolicy`.
- [ ] `YearRecord.monthlyNotes` exists as a type with no store action and no UI.
- [ ] `calculation.categoryTotals` is computed on every recalculation and consumed by nothing.
- [ ] The main bundle exceeds 500 kB; code-splitting has not been attempted.
- [ ] No component or end-to-end tests; panels are verified by hand in the browser.
- [ ] Swipe gestures, a full-screen editor, per-entity gesture settings, and dashboard widget configuration were requested but are **not implemented** in this pass.
