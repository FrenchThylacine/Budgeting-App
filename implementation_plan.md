# Live implementation plan

This is the active engineering tracker. A checkbox is ticked only after implementation **and** the relevant verification have both succeeded. "The code exists" is never sufficient.

**Last updated:** 2026-08-22 — two new activity cost models (session packs and fixed yearly), a rebuilt period selector, the historical-mode layering bug fixed at its root, a shared icon system for activities, the supplied A350 artwork as the application's identity, and a contrast sweep that found what the previous one could not measure.

**Verification state.** 542 tests across 30 files, all passing: 467 unit and 75 integration against a real PostgreSQL 17 database. Every claim below marked *browser-verified* was driven through Chrome DevTools against the running app backed by a throwaway local PostgreSQL database (`budget_browser_2026`), never against production data. **Production was last verified live on 2026-08-16**: `/api/health` returned `{"status":"ok","database":"connected"}`, `/api/auth/me` answered 200, and every budget route returned 401 without a session. **Nothing since 2026-08-16 has been deployed**, so none of it is verified in production.

## How this session verified things

- **Real PostgreSQL.** A local PostgreSQL 17 instance. The Neon driver speaks HTTP to Neon only, so `setDatabase()` injects a node-postgres adapter with the same interface; the SQL under test is byte-for-byte what production sends.
- **Real browser.** Chrome DevTools drove the running app at 320px, 390px and 1440px in both themes: activities created through the editor by hand, a renewal date typed key by key, the mark's resolution chain observed through a dead link, and hit-testing with `elementFromPoint` over every control that overlaps the historical banner.
- **Real upgrade path.** Migration 013 was run against a schema holding `activities` and `wishlist_items` in their pre-013 shape, so the new columns can only have come from the `ALTER`s — `CREATE TABLE IF NOT EXISTS` is a no-op there.
- **Falsification, not just confirmation.** Three claims were checked by breaking them first: removing one `ALTER` from migration 013 (the upgrade test fails), restoring the old `z-index: 1` rule (two popover controls are captured by the banner again), and the editor-typing suite, which still fails against the pre-fix focus code.

Anything that could not be verified this way is under *Not verified* and stays unticked.

## In progress / next

- [ ] Exercise the Neon HTTP driver's `sql.transaction([...])` specifically. Production runs on it; the integration suite drives an adapter with the same interface, not the driver itself.
- [ ] Automate the browser checks (Playwright). Everything marked "browser-verified" was driven by hand or by an ad-hoc script in the DevTools session.
- [ ] Deploy, and re-verify in production. Everything from 2026-08-17 onward is unverified there.

## Completed — 2026-08-22

### Activity cost models

- [x] **A payment cycle that is not the event cycle.** `sessionPack`: a price per session, a rate the sessions happen at, and a number of sessions one payment covers. The brief's gym — €20 a session, twice a week, settled every ten sessions — is **one €200 payment every five weeks**, and the timeline shows exactly that rather than eight €20 sessions in a fortnight. The monthly figure stays an accrual (€177.14 in a 31-day August, because a budget compares monthly commitments), and it is labelled `/month avg.` so it is never read as a charge. New leaf module `src/domain/payments.ts`; no other model's arithmetic changed (2026-08-22; 26 tests built on the specification's own example, plus browser-verified end to end and read back out of PostgreSQL).
- [x] **`fixedYearly`: a real annual payment on a real date.** €60/year shows €60/year and "≈ €5/month avg."; the editor states the monthly figure is "shown for comparison only. You are billed once a year". No monthly payment event is generated anywhere — asserted by asking the timeline for a full year and getting exactly one occurrence (2026-08-22).
- [x] **The renewal date is the schedule baseline, not a hint.** A renewal on 14 September 2026 produces 14 September 2026, 2027 and 2028 — never 1 January, never today plus 365 days. Change the date and every future charge follows. A baseline already in the past is rolled forward whole years rather than ignored, because an annual charge that happened last year still happens this year; 29 February clamps to the 28th rather than rolling into March (2026-08-22; typed key by key in the browser, and the next three dates read back from the editor).
- [x] **No baseline, no dates.** Both models refuse to invent one: with no renewal or start date the activity is listed as undated with its monthly average, and the editor says why. A payment-cycle activity that simply is not due inside the window is *not* listed as undated either — it has a date, and it is not yet (2026-08-22).
- [x] The dashboard timeline distinguishes a **payment** from an **occurrence**, and says what a payment covers. The one-off override control is hidden on payment rows: overrides act on the recurrence rule, which a payment cycle is not produced by, so the control would have written something that changed nothing (2026-08-22; browser-verified).
- [x] Migration `013` adds `sessions_per_period`, `session_period`, `sessions_per_payment`, `icon_url` and `icon_source_url` to `activities`, and `icon_url` to `wishlist_items`. All additive and nullable (2026-08-22; five repository round-trip tests, plus an upgrade test against tables in their pre-013 shape that fails if any one `ALTER` is removed).

### The period selector

- [x] **Rebuilt as a control bar.** Mode segments, one step either way, the period and its date range, today's date, and one button back to the current period — every frequent action one press, with only "jump to an arbitrary period" behind a disclosure. That disclosure is a month grid and a year stepper rather than two native dropdowns, which could never show where you are in a year at a glance (2026-08-22; browser-verified at 320px, 390px and 1440px, both themes).
- [x] **The layering bug, at its root.** `.historical-period > *` gave every child of the main area `z-index: 1`. That made each of them a stacking context, trapped the selector's popover inside the header's layer, and let the banner — a later sibling at the same z-index — paint over the whole header and swallow the clicks. The children are still positioned but no longer create contexts; the bar raises itself with `isolation: isolate`. No large z-index is involved anywhere (2026-08-22; every popover control that physically overlaps the banner hit-tested as reachable, and the old rule reinstated to watch two of them fail again).
- [x] **The historical banner is opaque.** It was a translucent wash of `--warning-soft`, so the page showed through it — which reads as a rendering fault rather than a state. Now a deep-navy band in the application's own palette with the signature red as a hairline, `pointer-events: none` on the band and `auto` on its own controls, so it can neither steal a press nor block one. It stacks on a phone instead of reducing its sentence to a seven-line column beside a button (2026-08-22; browser-verified at 320px).
- [x] The old `PeriodPopover` component and its stylesheet block are **deleted**, not left beside the new one (2026-08-22).

### Motion

- [x] **One direction, everywhere: left to right.** The period change and the tab transition both mirrored the direction of travel, which made the motion a second thing to read on every navigation — and meant the aircraft flew one way while the arriving page slid the other on half of them. Verified by reading the computed `animation-name` and keyframes in both directions: `periodShift` (−22px → 0) either way, `appSweepCover` growing from the left edge, `appSweepClear` leaving by the right, `pageArrive` from −26px (2026-08-22).
- [x] The tab ordering that fed the old direction logic is removed rather than left unread (2026-08-22).

### Identity

- [x] **The supplied A350 artwork is the identity.** `assets/brand/air-france-fin.jpg` is the master, unmodified; `scripts/build-icons.mjs` derives every size from it. Two framings, deliberately: the home-screen icons keep the artwork's own margin, and the tab icons are cropped to the fin's measured bounding box so the shape fills a 16px tile instead of floating in a quarter-width band of empty navy. Each small size is rendered from the 1024px original rather than downsampled twice (2026-08-22; every size rendered and inspected in Chrome, all nine assets served 200).
- [x] Large icons are quantised to a 64-colour palette, undithered: 48 kB against 181 kB truecolour, visually identical side by side at 512, and dithering made the file *larger* because it adds exactly the noise PNG compresses worst (2026-08-22; measured).
- [x] A dedicated maskable icon, because the artwork's own margin puts the fin at 12–86% of the width and a circular mask would shave its trailing edge (2026-08-22).
- [x] **The Budget OS mark is the sidebar control.** There were two things: a decorative logo that did nothing and a 28px chevron that collapsed the panel. They are now one button, with the chevron kept as the affordance. Collapsed to a 72px rail the mark is all that remains, and it is still the way back (2026-08-22; browser-verified that the preference survives a reload, and that the mobile navigation is untouched — the sidebar does not exist below 768px).
- [x] **The tricolour is bigger and theme-independent.** 76×3 → 108×5, and all three bands are now fixed opaque literals. Every band used to be a theme token and the middle one was swapped for a translucent white in dark mode, so it took the colour of whatever was behind it and the mark read as a navy rule with a red end and a gap in the middle (2026-08-22; measured byte-identical in both themes).

### Icons for activities

- [x] **Activities have the wishlist's icon capabilities, from the same module.** `ui/EntityMark` resolves one order everywhere: image link, then library icon, then the source site's icon, then a neutral mark — each network-fetched layer stepping down to the next on error, so a dead link can never render as a broken image. The wishlist's private favicon component is gone; activities had a library icon and nothing else (2026-08-22).
- [x] The **seller/brand distinction is preserved and generalised**: an activity's icon source is a separate field from any other link, exactly as the wishlist's `brandUrl` is separate from `url`. The rule that picks between them lives in one function (2026-08-22).
- [x] **The preview says what is actually rendered, not what was asked for.** A link that 404s used to leave the caption claiming "using the image you linked" while the mark quietly fell through to the site icon — so a dead link stayed invisible. It now reads "That image did not load, so the site icon of navigraph.com is being used instead. Check the link." (2026-08-22; observed against a link that genuinely fails to load).
- [x] A custom image link survives save, the database and a full reload, and renders on the card (2026-08-22; browser-verified, and read back out of PostgreSQL).

### Contrast

- [x] **Four status colours were being used as text.** `--success`, `--warning` and `--danger` are fill colours for chart series and progress bars; as 13–17px type they measure 3.2, 2.5 and 3.6 to one. The grade colours, the metric tones, the month comparison and the history deltas all took the fill. They take the `-text` variants now; `background` and `border` still take the fill (2026-08-22).
- [x] **Grey text on a tinted card in dark mode.** A status tint over a dark surface *lightens* it — `--success-soft` at 18% over `#121A28` lands three times brighter — and the grey ramp was tuned against the untinted surfaces, so the two lower greys dropped to 3.7–4.2 : 1. Lifted inside tinted cards only, rather than washing out every ordinary caption or weakening the tint that carries the tone cue (2026-08-22; worst case measured at 4.52 : 1 over five hues on two surfaces).
- [x] The sweep itself was the reason these survived the previous pass: it read `background-color` only, so any element on a gradient was measured against the page behind it. It composites gradient stops now, and reports **zero failures across ten tabs in both themes** (2026-08-22).

### Smaller things found on the way

- [x] The live estimate in the activity editor formatted money with a hardcoded `symbol` mode while the card it previews used the user's setting — the same figure shown two ways, which reads as two figures (2026-08-22).
- [x] The timeline's cadence line ran through `.text-footnote`, which uppercases: "PAY EVERY 10 SESSIONS (≈ EVERY 5 WEEKS)" was a sentence being shouted (2026-08-22).
- [x] The historical banner's button carried an inline `margin-left: auto`, which beats every stylesheet rule that is not `!important` — so the phone layout could not stack it. Moved into the stylesheet (2026-08-22).
- [x] `EntityMark` clears its failure flags when the URL changes, so editing a broken link into a working one recovers instead of staying broken until the component unmounts (2026-08-22).

## Completed — 2026-08-21

### Financial correctness

- [x] **Externally funded spending is excluded from the personal budget, unconditionally.** It was a preference (`settings.ignoreNonBudgetSpending`, default *off*), so by default a €200 dinner a friend paid for was charged to the user's €1,000 budget: remaining read €500 rather than €700, and the burn rate, forecast, category caps and health score were all wrong by the amount somebody else had paid. The rule now lives in one leaf module, `src/domain/funding.ts`, which every budget selector filters through, and the setting is gone from the interface. The transaction keeps its full amount and stays visible (2026-08-21; 19 tests built on the specification's own worked example, plus browser-verified end to end: budget €1,000, personal €300, external €200, remaining €700).
- [x] Personal / Paid by others / All transactions shown side by side on Spending, as a line on the dashboard's spending card, and as its own section and note in every report (2026-08-21; browser-verified).
- [x] Changing a transaction's funding source changes every figure on save (2026-08-21; asserted both ways in tests).
- [x] `calculateYear` reported `totalSpend` and `ytdTotal` including external spend. Both are now personal, with `externalSpend` and `externalYtdTotal` alongside (2026-08-21).
- [x] The wishlist's active total summed `actualPrice` across currencies without converting — it added $600 and €40 into "€640" (2026-08-21).

### Editing

- [x] **The editor focus bug, at the root.** `EditorSheet` set focus inside an effect that listed `onClose` in its dependencies. Every caller passes a fresh closure and the draft lives in the parent's state, so the effect tore down and re-ran on every keystroke — and its first act is to focus the sheet's first field. Typing the second character of a name put the caret back at the start; typing in any later field threw focus to the first. It affected the transaction, activity and category editors too, not only the wishlist. The effect is now genuinely mount-only with `onClose` read through a ref: no timers, no repeated `focus()`, no selection restoration (2026-08-21).
- [x] **"Amazon Flight Simulator Hardware" typed one character at a time**, with focus and caret asserted after every one, in `tests/editor-typing.test.tsx` — which fails against the previous code — and again in the real browser: 32 characters, no focus loss, no caret movement, no remount (2026-08-21).
- [x] **The wishlist editor was rendered inside the card being edited**, which put a `position: fixed` backdrop inside `.swipe-content` — an element carrying `will-change: transform`, which makes it the containing block for fixed descendants. The full-screen sheet was laid out inside a 260px card and clipped by the row's `overflow: hidden`. One editor at the panel root now, and so is the purchase form (2026-08-21; browser-verified).
- [x] Wishlist fields are labelled, in the same shell and grid as the activity and transaction editors, instead of carrying their labels in placeholders that vanish on the first keystroke (2026-08-21).
- [x] Scenarios use `EditorSheet` rather than a bespoke modal that carried its own copy of the same focus bug (2026-08-21).
- [x] `Field` and `FieldGroup` are shared components rather than a private copy inside `ActivityPanel` (2026-08-21).
- [x] Form controls had no `font-family`, so every textarea in the app was set in the user agent's monospace next to sans-serif labels (2026-08-21).

### Identity and motion

- [x] **Full-screen tab transition.** A navy plane covers the viewport — over the sidebar and header, not only the content — carrying a dashed route between a red departure node and a white arrival node with an airliner running along it; the incoming page enters from the direction the navigation moved. The outgoing page is held until the screen is opaque, so the new one is no longer glimpsed for a frame or two before being covered. 690ms end to end, skipped entirely under `prefers-reduced-motion` (2026-08-21; browser-verified, including a paused mid-flight frame).
- [x] **Browser identity.** A simplified swept fin in navy and red, legible at 16px, as SVG, ICO, apple-touch-icon and a web manifest — not the A350 illustration shrunk to a smudge. Proper title, description, two theme colours, `noindex` (2026-08-21; rendered and inspected at 16, 32, 180 and 512px).
- [x] **The mobile Air France identity.** A phone has no sidebar, so the identity was in practice desktop-only: the whole app was a white page with a navy button on it. The header is now a full-bleed deep-navy band with a blue glow, white type and the signature red as a hairline at its foot — and it reclaims vertical space, 241px → 197px (2026-08-21; browser-verified at 320px and 390px, both themes).
- [x] **The tricolour is a signature, not a status bar.** It ran the full width, which its own comment said it should not; it is now a 76px centred tab, 56px on a phone (2026-08-21).
- [x] The health score leads its card at ~68px with the grade set under it in small caps and one sentence saying what it means — was 50px with a 12px caption (2026-08-21; browser-verified at 320px, 390px and 1440px).

### Accessibility

- [x] **Every caption in the application failed the contrast minimum.** `--text-tertiary` was 2.6:1 against the page — the token behind every caption, footnote, hint and empty state. A script measured every text node on all ten tabs in both themes, compositing translucent backgrounds; twenty elements failed. The grey ramp is now 15.6 : 6.7 : 4.9 and clears 4.5 on the page, the card and the inset ground alike (2026-08-21; re-measured after: **zero failures, ten tabs, both themes**).
- [x] Status colours have `-text` variants. One colour cannot both fill a chart series and be 13px text: `--success` read at 2.9 and `--warning` at 2.5 as text. Fills keep the saturated hue; text uses the darkened variant (2026-08-21).
- [x] Checkboxes and radios were the user agent's 13×13 default. Now 18px with `accent-color`, and their labels have a 32px minimum height (2026-08-21).
- [x] Every interactive control on all ten tabs has an accessible name, and no target is under 24px (2026-08-21; scripted sweep).

### Persistence

- [x] **Notes against a month persist.** `YearRecord.monthlyNotes` was in the model from the beginning and the loader returned a hardcoded `{}`, so anything written survived until the next read from the server and then vanished. Migration `011` adds a JSONB column; there is a store action and a place in History → Periods (2026-08-21; three repository round-trip tests including a malformed stored value, plus browser-verified: written, read out of PostgreSQL, and still there after a full reload).
- [x] **A manual next-renewal date on an activity** (migration `012`), overriding the calculated next occurrence in the upcoming timeline. Display-only by design: it changes *when* the next charge is shown, never what anything costs. A date in the past is ignored and the rule takes over again, and the editor says so (2026-08-21; six tests plus a repository round trip).

### Settings, currencies and reports

- [x] **Add and remove currencies from the display list.** `trackedCurrencies` narrows what every amount field offers; absent, all ten still apply. The display currency can never be untracked, nor can one that real records are denominated in, and a record keeps its own currency for editing even after it stops being tracked (2026-08-21; seven tests).
- [x] **Manual reports.** Any window: presets for last 30 days, last 90 days, this quarter and year to date, plus two date fields. A custom range deliberately carries **no** budget or remaining figure — the budget is monthly, and prorating one would be a number the user never chose — and says so. Comparison is against the range of equal length immediately before (2026-08-21; seven tests, plus a 233-day report generated and read in the browser).
- [x] **`PATCH /api/snapshot/settings` validates per field.** It spread `req.body` straight into the stored settings: `baseCurrency: {}` would have formatted every amount as `[object Object]`, `monthlyBudget: "lots"` would have made every figure NaN, and an unknown key would have been stored forever and synced to every device (2026-08-21; ten tests).
- [x] **`POST /api/snapshot/reset` removed.** It answered `{"success": true}` without doing anything — the worst possible shape for a destructive endpoint, because a caller cannot tell it from a real reset. Nothing called it; the client's Reset writes an empty snapshot through the guarded `PUT` path (2026-08-21).
- [x] **Four settings that were stored and read by nothing.** `liveClockEnabled` is wired, and turning it off stops the minute timer rather than merely hiding its output. `autoWalletRollupEnabled` and `promptBeforeMonthClose` are removed — the close-month dialog already asks every time, with the figure in front of the user. `nanPolicy` had one legal value, which made an invariant look like a preference; it is now a documented invariant (2026-08-21).
- [x] `calculation.categoryTotals` was recomputed on every recalculation and read by nothing. The helper is kept and exported; the dead field is not (2026-08-21).

### Features that existed but could not be reached

- [x] **Seasonal presets.** `applySeasonalPreset` was implemented, seeded, and called from nowhere — and a real account is seeded with none, so the feature could not be used at all. Seasons now have a section in the Scenario Lab, and the way in is capture rather than a form (2026-08-21).
- [x] **Dashboard section configuration.** Seven sections, each shown or hidden and moved up or down, stored as one ordered list so order and visibility cannot disagree. A stored arrangement is reconciled against the sections that exist: unknown ids dropped, missing ones appended in place. The health and headline figures cannot be hidden (2026-08-21; ten tests, and browser-verified that a reorder and a hide both survive a full reload through the server).

### Icons and performance

- [x] **Icon library 192 → 244, across sixteen groups**, including a flight-simulation group. Every name checked against the installed lucide build; searching "winwing", "navigraph", "rudder", "a350", "pesim", "throttle", "theatre", "museum", "arabic", "basketball", "netflix" and "spotify" all land on a sensible shape (2026-08-21; all twelve typed into the real picker).
- [x] Brand marks are deliberately **not** drawn. Every name in the brief is a trademark, and the app already has the right answer: give a wishlist item the maker's site and it uses their real icon, which is what the separate brand link is for (2026-08-21).
- [x] **Vendor code split from application code.** Everything landed in one 900 kB chunk, so a one-line fix invalidated React, the icons and the store for every returning visitor. Now app 94 kB gz, react 101 kB, icons 29 kB, `xlsx` 143 kB still on demand. First load is unchanged; the cost of the *next* deploy drops from 222 kB to 94 kB (2026-08-21; measured).

### Interaction and honesty

- [x] **Swiping to delete a wishlist item skipped the confirmation the Delete button showed.** The same action, reached two ways, behaved differently — and the *more* dangerous route had the *less* protection. On a phone there is no Ctrl+Z, so it was a one-swipe unrecoverable delete (2026-08-21; browser-verified with touch emulation that declining now leaves the item).
- [x] Nine exported functions were called from nowhere, including two complete-but-unreachable CSV exports duplicating data the Excel export already writes, and a pair of cost helpers that picked whichever price field happened to be filled in — a second, simpler, wrong answer sitting one import away from the right one (2026-08-21).
- [x] A €81.64/year subscription showed "€6.80 /month" in the same style a monthly one does. It reads "/month avg." now, and the estimate says you are billed once (2026-08-21).
- [x] The timeline showed "—" for an annual charge on a known renewal date, declining to state a figure it holds (2026-08-21; three tests, including that a missing amount stays missing and a zero stays zero).
- [x] `.text-footnote` uppercases its content, and the transaction, month-close and wallet rows put the **user's own note** inside it — "Winwing Orion throttle" was displayed as "WINWING ORION THROTTLE" (2026-08-21).
- [x] Seven explanatory sentences across Settings, the import preview and History were set in the same label style and rendered in full caps (2026-08-21).

### Misleading UI

- [x] The link on a wishlist card was labelled with the **brand's** domain but opened the **seller's** — the one place in the app where the text and the destination disagreed. The label now names the destination and the brand is stated separately when it differs (2026-08-21).
- [x] A wishlist item's name and price competed for a 260px card and the name lost, truncating to "Amazon Fli…" (2026-08-21).

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
- [x] **The supplied A350 is in.** Background flood-filled away from the borders, trimmed, turned nose-right, held at 512px for a largest use of 132px, 33 KB as a paletted PNG. It carries the loading screen and the first-run card; marks at 34px and the transition's small craft stay on the drawing, which is legible at that size where an illustration is mush. The drawing is still the `onError` fallback, so a missing file cannot produce a broken image (2026-08-17).
- [x] The boot route line drew a bright streak off across the whole screen — its travelling highlight is animated a full width past each end and the track was `overflow: visible` (2026-08-17; measured: track 260px, `scrollWidth` 260).
- [x] **Account settings.** Change email and change password, both behind the current password. The change-password endpoint, its client and its store action existed and were reachable from nowhere in the interface (2026-08-17; five integration tests against real PostgreSQL).

## Verified in a browser, against real PostgreSQL — 2026-08-22

| Check | Result |
| --- | --- |
| €20/session, 2×/week, pay every 10 sessions | **One €200 payment every 35 days**; €177.14/month avg. in a 31-day August; €2,086/year |
| The same gym over a fortnight | **One** payment on the timeline, not eight sessions |
| Nebula €60/year, renewal typed as 14/09/2026 | Next charges **14 Sept 2026 · 2027 · 2028**; €5.00/month avg.; €60.00/year |
| The same subscription over a full year | **Exactly one** occurrence — no monthly event anywhere |
| A payment-cycle activity with no renewal date | Undated, with its monthly average. No date invented |
| Popover controls overlapping the historical banner | Every one hit-tests as reachable; the old rule reinstated captures two |
| The banner's own "Edit this period" button | Reachable; the band itself captures nothing |
| Period animation, forward and back | `periodShift` both ways, −22px → 0 |
| Tab sweep, down the sidebar and up | `appSweepCover` / `appSweepClear` / `pageArrive` identical either way |
| Tricolour, both themes | 108×5, three opaque literals, byte-identical |
| Sidebar toggle | 72px rail, label flips, preference survives a reload, mobile nav untouched |
| A custom image link on an activity | Saved, in PostgreSQL, and rendering on the card after a full reload |
| A custom image link that fails to load | Falls through to the site icon; the caption says so |
| Nine icon assets and the manifest | All 200; the artwork renders at 16, 32, 48, 96, 180, 192 and 512 |
| Contrast, ten tabs, both themes, gradients composited | **Zero failures** |
| 320px and 390px | No horizontal overflow; no target under 24px; banner stacks |

## Verified in a browser, against real PostgreSQL — 2026-08-21

Each of these is one of the specification's own examples, checked rather than assumed:

| Check | Result |
| --- | --- |
| €1,000 budget, €300 personal, €200 external | Remaining **€700**; the €200 named separately and charged to nothing |
| "Amazon Flight Simulator Hardware", typed one key at a time | 32 characters, no focus loss, no caret movement, no remount |
| Padel on Monday + Thursday at €30/session | **9 occurrences in August**, €270/month, €3,150/year — the calendar, not four weeks |
| €30/session × 8 sessions per month | **€240/month** |
| A transaction linked to a wishlist item | Transaction created, item marked bought, and the item then stops being offered to any second transaction |
| Live exchange rates | Fetched from `open.er-api.com`, timestamped and attributed |
| Historical period | Banner shown, Add disabled, no editable rows; "Go to current month" returns cleanly |
| Server stopped mid-edit | "Offline — this device only", never "Saved"; Retry after restart put the row in PostgreSQL |
| Dashboard reorder and hide | Survived a full reload through the server |
| A note against a month | Written, read out of PostgreSQL, and still there after a full reload |
| Contrast, ten tabs, both themes | Zero WCAG AA failures |
| 320px and 390px | No horizontal overflow; header 197px; every control named; no target under 24px |

## Not verified

- [ ] Multi-device sync **in production**. Verified locally against PostgreSQL with two isolated contexts; the production instance has no data in it yet.
- [ ] Live exchange rates **from the production runtime**. Verified from the development runtime on 2026-08-21: the fetch reached `open.er-api.com`, the settings reported "Exchange rates updated", and the panel showed the timestamp and the source.
- [ ] Print/PDF output of the reports on a real printer dialog. The HTML is generated, self-contained, and rendered in a browser tab with a print button; nobody has pressed it against a physical printer.
- [ ] Swipe gestures on a **physical touchscreen**. Driven with synthetic pointer events under touch emulation on 2026-08-21: 1:1 tracking to the panel edge, 45% rubber-banding past it, arming at 150px of travel, and — after the fix below — declining the confirmation leaves the row.

## Actions needed from the repository owner

- [ ] **Deploy.** Everything from 2026-08-17 onward is committed and unverified in production. Migrations `011`, `012` and `013` will run on first boot; all are additive `ADD COLUMN IF NOT EXISTS` and were tested against a database that already had data in the pre-migration shape.
- [ ] `RESEND_API_KEY` and a verified sender domain, for password-reset email. Everything else works without it, and `forgot-password` deliberately answers the same either way.
- [ ] Decide whether preview deployments should be allowed to call the API (`CORS_ALLOW_VERCEL_PREVIEWS`).
- [ ] Optionally set `SIGNUP_INVITE_CODE` — without it, anyone who finds the URL can create an account.

## Discovered issues — open

- [ ] **The granular REST routes do not know the new cost models.** `POST`/`PATCH /api/activities` handle a subset of fields and never handled `costModel` either; they are documented API surface with no live caller, and the client persists only through `GET`/`PUT /api/snapshot`. Adding the new fields there would widen an unused surface rather than fix anything, so it is recorded instead.
- [ ] **`sessionsPerMonth` and `sessionsPerPeriod` both describe a frequency.** The first belongs to `perSession`, the second to `sessionPack`, and `sessionsPerWeek()` reads either. Two fields for one idea is a seam; merging them would migrate every existing `perSession` activity, which is not worth doing for tidiness alone.
- [ ] **Back-dating from the current period** is still permissive by design: a transaction can be dated into a past month while viewing the current one. Late receipt entry is legitimate, and a dedicated audited path exists for rewriting a closed period.
- [ ] **The granular REST routes are not on the live write path.** The client persists only through `GET`/`PUT /api/snapshot`; the per-entity routes are implemented and validated but unused. Their validation now constrains the settings route, which is the one a client could reasonably reach for; the rest remain documented API surface with no live caller.
- [ ] `xlsx@0.18.5` carries two high-severity advisories (prototype pollution, ReDoS) with no fix on the npm registry — SheetJS publishes fixed versions only from its own CDN. It is loaded on demand, only when the user chooses a file they supplied themselves, and never runs on the server. Moving to the CDN tarball would put a non-registry URL in the lockfile, which is its own deployment risk. Documented rather than silently accepted.
- [ ] No component or end-to-end tests beyond `tests/editor-typing.test.tsx`. Panels are verified by hand in the browser. The two mistakes that have cost the most time on this project were both measurement errors of exactly that kind.
- [ ] The first paint still costs ~234 kB gzipped across four chunks. The split means a *repeat* visit after a deploy costs 94 kB, but a cold first load is unchanged. The wishlist and activity panels are not code-split, because they are primary tabs.
- [ ] `HorizontalBarChart` reserves a fixed minimum height, so a category breakdown with one row leaves a tall empty card.

## Discovered issues — closed 2026-08-22

- ~~Status colours used as text at 2.5–3.6 : 1~~ → the `-text` variants, in all six places.
- ~~Grey captions on tinted cards in dark mode at 3.7–4.2 : 1~~ → lifted inside tinted cards only.
- ~~The contrast sweep could not measure text on a gradient~~ → it composites gradient stops now, which is how the two above were found at all.
- ~~The historical banner was translucent and stole clicks~~ → opaque, and inert apart from its own control.
- ~~The period selector's popover could not paint over the banner~~ → the blanket `z-index: 1` removed.
- ~~Activities had a library icon and nothing else~~ → the shared resolver, with an image link and a source site.
- ~~A dead image link claimed to be in use~~ → the caption reports the layer actually rendered.
- ~~`PeriodPopover` was left in the tree with no importer~~ → deleted.

## Discovered issues — closed 2026-08-21

Everything below was on the open list and is now done; the entries above carry the detail.

- ~~Currency display list is fixed in `CURRENCY_OPTIONS`~~ → `trackedCurrencies`.
- ~~Manual next-renewal date~~ → `Activity.nextRenewalDate`, migration 012.
- ~~Manual reports~~ → custom ranges.
- ~~`PATCH /api/snapshot/settings` spreads the body with no validation~~ → per-field validation, ten tests.
- ~~Seasonal presets are unreachable~~ → Seasons section in the Scenario Lab, with capture.
- ~~Wishlist totals sum across mixed currencies~~ → converted.
- ~~`POST /api/snapshot/reset` is a stub that reports success~~ → removed.
- ~~Four settings seeded but read by nothing~~ → one wired, three removed.
- ~~`YearRecord.monthlyNotes` has no store action and no UI~~ → both, and it now persists.
- ~~`calculation.categoryTotals` is computed and consumed by nothing~~ → removed.
- ~~Dashboard widget configuration was requested and is not implemented~~ → seven sections, shown/hidden and reordered.
