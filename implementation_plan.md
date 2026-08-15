# Live implementation plan

This is the active engineering tracker. A checkbox is ticked only after implementation **and** the relevant verification have both succeeded. "The code exists" is never sufficient.

**Last updated:** 2026-08-16 — V3 pass. Multi-device synchronization diagnosed and fixed (the real cause was silent IndexedDB fallback masking an unreachable API, plus a concurrency guard that an offline device could defeat). Analytics rebuilt chart-led with intelligent gridlines and budget reference lines. Live exchange rates, printable reports, flexible recurrence models, icon system, typography and colour systems. 240+ tests, both builds clean.

## How this session verified things

- **Real PostgreSQL.** A local PostgreSQL 17 instance. The Neon driver speaks HTTP to Neon only, so `setDatabase()` injects a node-postgres adapter with the same interface; the SQL under test is byte-for-byte what production sends.
- **Real browser.** Chrome DevTools drove the running app against that database — including **two isolated browser contexts as two devices**, and a deliberate server shutdown to test offline behaviour.

Anything that could not be verified this way is under *Not verified* and stays unticked.

## In progress / next

- [ ] Verify a production Vercel deployment (needs authenticated deploy access — see *Actions needed from the repository owner*).
- [ ] Exercise the Neon HTTP driver itself, in particular `sql.transaction([...])`.
- [ ] Automate the browser checks (Playwright). Everything below marked "browser-verified" was checked by hand this session.

## Completed — V3 (2026-08-16)

### Multi-device synchronization — the reported bug

- [x] **Diagnosed the real cause.** Both load and save caught API failures and fell through to IndexedDB, so an unreachable backend was indistinguishable from a healthy one and each browser silently kept its own dataset (2026-08-16).
- [x] Server is authoritative when reachable; IndexedDB is an explicit offline cache. Hydration asks the server first, so a device cannot boot stale and then overwrite newer remote data (2026-08-16).
- [x] Explicit persistence state — `Saved` / `Saving…` / `Offline — this device only` / `Sync conflict` / `Sync failed` — with Retry, in the header and Settings (2026-08-16; browser-verified with the server stopped: the badge read Offline, never Saved).
- [x] Re-sync on window focus so another device's change appears without a reload (2026-08-16; browser-verified: device A saw device B's edit without reloading).
- [x] **Replaced the unsafe concurrency guard.** It trusted a client-supplied revision and accepted anything higher, so a device that edited offline could return with an inflated counter and overwrite the other device. Now a compare-and-swap on `baseRevision`, with the server assigning the revision (2026-08-16; 5 integration tests including the inflated-counter case).
- [x] `GET /api/snapshot/revision` cheap freshness probe (2026-08-16; integration-tested).
- [x] Full lifecycle verified against a live database: A writes → B reads → B edits → A sees it on focus → stale write from A rejected with B's data intact → server stopped → Offline reported → server restarted → Retry delivered the change (2026-08-16).

### Persistence completeness

- [x] **Found and fixed silently dropped fields.** The repository writes a fixed column list, so activity icon/colour/cost model/schedule, wishlist url/colour/link, and the spending↔wishlist link never survived a round-trip. Migration `005` plus round-trip tests per field group (2026-08-16).
- [x] Malformed stored weekday data is read as "no schedule" rather than throwing, so one bad row cannot make a snapshot unloadable (2026-08-16).

### Analytics — chart-led

- [x] Dependency-free SVG chart library: line, bar, stacked bar, donut, heatmap, sparkline, horizontal bars, gauge (2026-08-16; 53 tests).
- [x] **Intelligent gridlines.** `niceTicks` picks 1/2/5×10ⁿ steps from the range — 0–20,000 gives five lines, not two hundred (2026-08-16; property-tested over 200 cases).
- [x] Labelled budget reference lines on budget charts, subtle rather than dominant (2026-08-16; browser-verified).
- [x] Analytics page rebuilt chart-led in sections: Overview, Spending, Budget, Categories, Recurring, History (2026-08-16).
- [x] Dashboard rebuilt around charts and a large health gauge; both surfaces read the same shared selectors (2026-08-16; browser-verified).
- [x] New selectors: daily spending calendar, category monthly series, recurring/one-off monthly split, recent period totals, cumulative forecast, financial health (2026-08-16).
- [x] Missing periods render as gaps/`?`, never as a fabricated zero; a recorded 0 stays a real 0 (2026-08-16; browser-verified — Jan/Sep–Dec showed `?` while August showed its real value).
- [x] Corrected a scoring bug: an empty period scored as perfect budget adherence, because pacing reports spend 0 when nothing is recorded (2026-08-16).

### Recurrence and activities

- [x] Four cost models — `auto` (legacy, unchanged), `perSession`, `schedule`, `fixed` — with the legacy path guarded by an oracle test over 14 activity shapes (2026-08-16).
- [x] Schedule maths counts **real occurrences per calendar month**, never "4 weeks" (2026-08-16; tested against brute-force counts for all twelve months, five-Monday months, and leap February).
- [x] Searchable, categorised icon picker — 84 lucide icons across 11 categories, every name verified against the library's exports with a safe fallback (2026-08-16).
- [x] Activity colour themes the whole card, with contrast held in light and dark (2026-08-16).
- [x] Wired up `duplicateActivity`, `reorderActivity`, `matchesActivityFilters`, `sortActivities` — all existed and were called by nothing (2026-08-16).
- [x] Added `pricePerPurchase` and `yearlyEstimate` to the form: "purchase" and "yearly" were selectable recurrence types whose price could not be entered (2026-08-16).

### Currency

- [x] Live rates from a keyless public provider, cached with a staleness window; failure leaves existing rates untouched (2026-08-16; browser-verified — real rates fetched and persisted to the database).
- [x] Manual overrides are never overwritten by a refresh (2026-08-16; tested).
- [x] **Fixed a silent conversion fault**: unknown pairs returned a 1:1 rate, so a GBP amount counted as EUR. Rates now pivot through EUR, non-positive rates are ignored rather than zeroing amounts, and `canConvert` exposes the fallback (2026-08-16; 18 tests).

### Reports

- [x] Printable monthly and annual reports from the shared selectors, with a print/save-as-PDF action and a download fallback when pop-ups are blocked (2026-08-16; 11 tests).
- [x] Self-contained HTML, user text escaped, unknown months marked rather than drawn as zero (2026-08-16).

### Design system

- [x] Single type scale as tokens, consumed through `.text-*`; tabular numerals on every financial figure (2026-08-16).
- [x] Semantic colours strengthened, eight-colour chart series ordered for colour-vision safety, dark mode redefining hue and alpha (2026-08-16).
- [x] Status never carried by colour alone — rail plus value colour plus icon (2026-08-16).
- [x] Loading screen and tab transitions, both respecting `prefers-reduced-motion` (2026-08-16).

### Period navigation

- [x] "Go to current month/week/year", shown only when not already there (2026-08-16; browser-verified).
- [x] Header states the selected period's full date range and, when viewing another period, today's date and the real current period (2026-08-16).
- [x] Fixed: the header showed an ISO week number in month mode that often belonged to a different month (2026-08-16).
- [x] Fixed: jumping to the current period updated year and month but left the ISO week stale (2026-08-16).

### Bugs found during the audit

- [x] `createSeedBudgetSnapshot()` handed out the shared module-level `defaultCategories` array, so adding a category mutated the seed for every later snapshot in the process (2026-08-16).
- [x] A lucide `Map` icon import shadowed the global `Map` constructor and crashed the app (2026-08-16; browser-verified).

## Completed — earlier sessions

- [x] Persistence verified against real PostgreSQL; five SQL-level defects fixed (2026-08-15; see `docs/DATABASE.md`).
- [x] The compiled server could not start at all — ESM extensions, path alias, wrong `server:prod` path, missing `ts-node` (2026-08-15).
- [x] Consent-gated historical editing with a full audit trail; approvals stay immutable (2026-08-15).
- [x] History panel rebuilt; budget approvals had never rendered (2026-08-15).
- [x] Category caps made functional — stored and editable but read by no calculation (2026-08-15).
- [x] Editing a transaction silently reset its recurrence to one-off (2026-08-15).
- [x] "Today" used the UTC date, mis-filing after-midnight entries east of UTC (2026-08-15).
- [x] Mobile: horizontal overflow at portrait widths, and five sections unreachable behind "More" (2026-08-15).
- [x] Shared analytics selectors; the Dashboard had ignored the global period selector (2026-08-15).

## Not verified — do not tick without evidence

- [ ] **Production Vercel deployment.** The build compiles and `api/[...path].ts` bundles cleanly (checked with esbuild), but no authenticated deploy has been run from this environment.
- [ ] **Neon HTTP transport**, especially `sql.transaction([...])`. All SQL is verified against real PostgreSQL through an equivalent driver interface.
- [ ] **Real multi-hardware sync.** Two isolated browser contexts against one server exercise the same client/server/database path, but not physically separate devices or networks.
- [ ] **Live rates in production.** Verified in the browser against the public provider; behaviour behind a corporate proxy or with the provider down is covered only by tests.

## Actions needed from the repository owner

1. **Push access or a merged PR.** Local commits are ready. The GitHub account available here has read-only access to `FrenchThylacine/Budgeting-App`, so work is pushed to a fork and offered as a pull request.
2. **Vercel deployment check.** Deploy, then open `/api/health`. It answers `{"status":"ok","database":"connected"}` when healthy and `503 degraded` with the reason otherwise. If it is degraded, `DATABASE_URL` is missing or wrong in the Vercel project.
3. **`DATABASE_URL` in Vercel.** Set it through the Vercel dashboard or `vercel env add` — never paste it into chat.
4. **Confirm multi-device on real hardware** once deployed: add a transaction on your phone, then open the app on your computer and check it appears.

## Discovered issues — open

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
