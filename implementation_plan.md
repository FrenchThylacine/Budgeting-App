# Live implementation plan

This is the active engineering tracker. A checkbox is ticked only after implementation **and** the relevant verification have both succeeded. "The code exists" is never sufficient.

**Last updated:** 2026-08-17 — Air France identity, physical swipe, dashboard declutter, account settings. **Production was verified live on 2026-08-16**: `/api/health` returned `{"status":"ok","database":"connected"}`, `/api/auth/me` answered 200, and every budget route returned 401 without a session. Today's work has **not** been deployed and is therefore unverified in production. 374 unit tests plus the database suites; today's browser checks ran against a throwaway local PostgreSQL database, never against production data.

## How this session verified things

- **Real PostgreSQL.** A local PostgreSQL 17 instance. The Neon driver speaks HTTP to Neon only, so `setDatabase()` injects a node-postgres adapter with the same interface; the SQL under test is byte-for-byte what production sends.
- **Real browser.** Chrome DevTools drove the running app against that database — two isolated contexts as two devices, touch emulation for gestures, and a deliberate server shutdown for offline behaviour.
- **Real production.** `curl` against the deployed Vercel URL for routing, health, and the authentication guard.

Anything that could not be verified this way is under *Not verified* and stays unticked.

## In progress / next

- [ ] Add and remove currencies from the display list; the set is currently fixed in `CURRENCY_OPTIONS`.
- [ ] A manual next-renewal date on an activity, overriding what the schedule computes.
- [ ] Manual reports alongside the generated monthly and annual ones.
- [ ] Supplied A350 artwork. `AircraftArt` and `AIRCRAFT_ASSET_PATH` are built to accept a file at `/aircraft.png` and fall back to the drawing if it is absent or fails to load — no code change needed once a file is dropped in.
- [ ] Exercise the Neon HTTP driver's `sql.transaction([...])` specifically. Production runs on it, but no test drives it directly.
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

## Completed — identity, interaction and account (2026-08-17)

Verified in a real browser at 390px and 1440px against a throwaway local PostgreSQL database. Not deployed.

- [x] **Tricolour signature** above the whole app and inside the sign-in card. Its middle band is a pale blue-grey, not white: on a white card white is a gap, and a rule broken in the middle reads as a rendering fault rather than a flag (2026-08-17).
- [x] The drawn airliner replaces the Lucide `Plane` in the sidebar, the sign-in card and the boot screens; the first-run mark sits on a navy medallion, because a white livery on a white card is a navy fin and a red line (2026-08-17).
- [x] Boot screen is a route line rather than a progress bar — a progress bar promises a known duration (2026-08-17).
- [x] **Tab transition reduced to a micro-interaction**: a hairline route across the top of the panel with a 22px aircraft along it, 720ms. The previous version flew a 44px aircraft through the middle of the content (2026-08-17).
- [x] **Directional period transitions.** Forward slides in from the right, back from the left, driven by a new `periodOrdinal` because the dropdowns can jump anywhere. Applied to the frame, not by remounting, so scroll and typed filters survive (2026-08-17; verified by reading the class through a change in each direction).
- [x] **Physical swipe.** 1:1 tracking to the panel edge, then 45% rubber-banding; past 150px of finger travel the row arms, the action fills it, its label moves to the revealed edge, and releasing performs it. Below that, release snaps open or shut (2026-08-17; browser-verified that opening does not delete, that a long drag then release does, and that declining the confirmation leaves the row).
- [x] **The touch rule hiding per-row buttons had never applied.** The containers carried an inline `display: flex`, which outranks any stylesheet, so every phone still showed the buttons the swipe was built to replace (2026-08-17).
- [x] With that fixed, the transaction amount vanished on touch — it was inside the container being hidden. Moved to `.row-trailing` (2026-08-17).
- [x] **Editors label their fields.** They carried `aria-label` and `placeholder` only: a screen reader was served, a sighted user saw a box reading "Budget" and another reading "One-off" with nothing to say what either meant (2026-08-17).
- [x] Wishlist add and edit use the editor sheet, with a live preview of the mark the item will carry and where it came from (2026-08-17).
- [x] **Icon library 84 → 192** across 15 groups, four of them new: Aviation, Gaming, Shopping & services, Outdoors. Every name checked against the installed lucide build; measured cost 13.2 KB gzipped (2026-08-17).
- [x] **Dashboard declutter.** A blank account gets three ways to start instead of eight cards saying "No data"; reference material is behind collapsible sections, unmounted when closed (2026-08-17).
- [x] The suggested-budget card no longer appears when the suggestion is zero — approving it wrote a permanent, uneditable record stating the month's budget was zero (2026-08-17).
- [x] **The Save button is gone.** It stamped `lastUpdated` to force a write, implying work was unsaved until pressed, and cost a full row on a phone (2026-08-17).
- [x] Today's date and local time, refreshed each minute, inside the period widget with one button back to the current period (2026-08-17).
- [x] **`.btn` had no disabled styling anywhere.** Close Month on a closed period, reorder arrows at the ends of a list, Approve with nothing to approve — each looked pressable and silently did nothing (2026-08-17).
- [x] **Account settings.** Change email and change password, both behind the current password. The change-password endpoint, its client and its store action existed and were reachable from nowhere in the interface (2026-08-17; five integration tests against real PostgreSQL).

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
- [ ] **Seasonal presets are unreachable.** `applySeasonalPreset` is implemented and seeded but called from nowhere; it is also the only writer of `settings.selectedSeason`.
- [ ] Wishlist totals sum `actualPrice` across mixed currencies without conversion.
- [ ] `POST /api/snapshot/reset` is a stub that reports success without doing anything.
- [ ] Four settings are seeded but read by no code path: `autoWalletRollupEnabled`, `promptBeforeMonthClose`, `liveClockEnabled`, `nanPolicy`.
- [ ] `YearRecord.monthlyNotes` exists as a type with no store action and no UI.
- [ ] `calculation.categoryTotals` is computed on every recalculation and consumed by nothing.
- [ ] No component or end-to-end tests; panels are verified by hand in the browser. The two mistakes that cost the most time this session were both measurement errors of exactly this kind — reading DOM state in the same tick as a synchronous event and concluding a working component was broken.
- [ ] **Dashboard widget configuration** — choosing which cards appear — was requested and is not implemented. Sections are collapsible, but not selectable or reorderable.
- [ ] The main bundle is 830 kB raw / 206 kB gzipped after the icon expansion. `xlsx`, Analytics, Scenarios, History, Categories and Settings are split out; the wishlist and activity panels are not, because they are primary tabs.
