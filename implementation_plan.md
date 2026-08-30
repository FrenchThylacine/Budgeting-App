# Live implementation plan

This is the active engineering tracker. A checkbox is ticked only after implementation **and** the relevant verification have both succeeded. "The code exists" is never sufficient.

**Last updated:** 2026-08-30 — the V4 pass: the funding statistic corrected at the domain level, the whole Flightradar24 fleet extracted for the transition, a loading sequence with a genuine 3D orbit and advected smoke, a hundred and six untranslated strings found and fixed, and a broad reduction in controls and words across the application.

**Version:** 4.0.0. See `CHANGELOG.md` for what each version was.

**Verification state.** **872 tests across 46 files, all passing** — 790 unit and 82 against a real PostgreSQL 17 database. TypeScript clean for **both** targets: the frontend project and the server's, which compiles `src/domain` with no DOM library and caught a defect the frontend build is structurally blind to. **`scripts/verify-browser.mjs` drives a real Chrome on a brand-new account each run: 49 checks, all passing.** Both bundles build clean. Nothing from 2026-08-17 onward is verified in production.

## How this session verified things

**V4, 2026-08-30.** Three things this pass added to the method, each because
something had slipped through the previous one:

- **Look at the page, not at the dictionaries.** Every translation check ran
  against the five dictionaries, and a sentence written straight into the JSX
  passes all of them. `tests/no-hardcoded-english.test.ts` reads the components
  instead. It found 106 on its first run — and then seven more the moment it
  learned to see a sentence spread over three lines.
- **Measure the picture.** The claims this pass makes about the loading screen
  are not "the code looks right": the harness records the z-index an escort was
  drawn at to prove it passed behind the lead, and reads the smoke canvas's
  pixels along a vertical cut to prove the bands are blue, white and red in
  that order.
- **Build both projects.** `npx tsc -b` compiles the frontend; the server is a
  separate TypeScript project that compiles `src/domain` with no DOM library,
  and it caught a defect the frontend build is structurally incapable of
  seeing.



- **A browser harness instead of a habit.** `scripts/lib/cdp.mjs` speaks the Chrome DevTools Protocol over Node 22's built-in WebSocket — about two hundred lines, no browser-automation dependency, and no Playwright. `scripts/verify-browser.mjs` creates its own account and drives the loading sequence, all six themes, the three aircraft, the transition's direction, the period selector's layering, the second currency, the specification's own gym, the funding split, the wallet and its reset, and the report.
- **It found four defects on its first pass**, every one of which had passed the unit suite: `/month avg.` and `/year` hardcoded on the activity card; the loose English word "per" wedged between two controls where no translation could move it; "August 2026" printed directly above "1 août 2026 – 31 août 2026"; and "Mois En Cours", from three CSS rules applying `text-transform: capitalize` to text that used to be an interpolated lower-case English word.
- **Then a fifth, and a sixth**, on the second pass: "8.86" with a full stop in a French sentence otherwise full of commas, and "tous les 5 semaines" — an article glued in front of a noun whose gender the sentence could not know.
- **Contrast is measured, not eyeballed.** The themes are data, so `tests/theme-contrast.test.ts` walks every preset in both appearances and asserts every text token against every surface. Thirty assertions, and a theme that fails one fails the build.
- **Translation completeness is a test, not a claim.** `tests/i18n.test.ts` asserts both directions: every key the source asks for exists in English, and every language marked *translated* covers the whole English key set. 1,054 keys × 5 languages.

## Completed — 2026-08-30 (V4)

### The funding statistic was wrong, at the domain level

- [x] **"Share of the yearly total" counted activities the user does not pay for.** `activityBudgetSummary` divided every activity by the *gross* yearly total, so a €1,200 subscription a parent funds took 58% of a chart headed "share of the yearly total" and made the user's own €600 gym look like a third of their year. The list and the denominator now move together: personal activities, personal total. Fixed where the figure is computed, so the statistics page, the report and anything downstream inherit it (`domain/activityBudget.ts`).
- [x] **The omission is visible rather than silent.** A chip on the chart says how many activities were left out, and the funding split directly below still answers "who paid" against the gross.
- [x] **Six regression tests**, where the previous pass had none for this figure: the list, the denominator, that the shares still sum to 100, the count of exclusions, the all-external case, and that the three-way split keeps reading the gross (`tests/activity-budget.test.ts`).
- [x] **The rest of the statistics audited for the same class of error.** Every spending figure already flows through `personalEntries`; the activity side was the only place a gross total was used as a personal denominator.

### The transition flies the supplied fleet

- [x] **Twenty-two aircraft, cut from the sheet.** `scripts/extract-craft.mjs` flood-fills the paper *and its drop shadows* from the border, labels what survives, and regroups the components into icons by the layout's own geometry — a measured 12-pixel merge gap, because the widest gap *inside* an icon on this sheet is one pixel and the narrowest gap *between* two is seventeen. The four shapes that are not aircraft are named `null` and not shipped.
- [x] **White, nose-right, one size.** Each is painted flat white from its own mask, rotated a quarter turn (the sheet draws nose-up; this application's convention is nose-right, so a rotation of zero means "the way this app moves"), and fitted to one 160px box so a glider does not fly the length of a runway.
- [x] **Two preferences, not one.** `settings.aircraft` chooses the loading screen's aeroplane from the three illustrations; `settings.transitionAircraft` chooses the transition's from the twenty-two silhouettes. Concorde is the default in both. They were one setting, which was only defensible while both lists were the same three aircraft.
- [x] **Verified in the browser**: 22 distinct tiles, every one decoding, every one from `/craft/fleet/`, every one named for a screen reader, and the pixels measured — over 98% of the opaque area of a silhouette is white.
- [x] **The old silhouettes are gone**, and `build-icons.mjs` no longer generates them.

### A loading sequence with depth

- [x] **The orbit is in three dimensions.** The escorts fly a circle in a plane tilted 56° out of the screen, so they pass above the lead, below it, in front of its nose and away behind its tail. Perspective (`D / (D − z)`), occlusion (the sign of `z` chooses the layer) and aerial perspective all come off the same coordinate. Verified: the harness records that an escort is drawn *both* behind and in front of the lead during the sequence.
- [x] **The smoke is advected, not drawn.** Each jet emits a particle a frame at its tailpipe; from then on the particle belongs to the air — drifting back at the airspeed, spreading on a square root, wandering on two slow frequencies and fading. The ribbon is the polygon through those particles, smoothed with quadratic curves through the midpoints so a turn is a curve rather than a chain of corners.
- [x] **Two canvases, one either side of the lead**, with each run of particles drawn on the layer its own `z` chooses — which is what lets a ribbon stay behind the aircraft while the jet that drew it comes round the front.
- [x] **The tricolour is measured, not asserted.** The harness samples the smoke canvases along a vertical cut just behind the formation and checks the bands read blue, white, red from top to bottom.
- [x] **Performance**: median frame 8.3ms, worst 10.4ms, over 355 frames. Six filled polygons a frame, no layout.

### A hundred and six sentences that were never translated

- [x] **Found by looking at the components rather than at the dictionaries.** Every previous check ran against the five dictionaries — no missing keys, no untranslated values, no unused keys — and a sentence written directly in the JSX passes all three. 106 user-facing English strings were still in the source: every swipe-action label, the whole sign-in screen, chart tooltips, editor titles, empty states, and "immutable" on a history row.
- [x] **`tests/no-hardcoded-english.test.ts`** now scans the components and fails on a new one, with an allowlist of three entries, each of them a decision rather than an exemption.
- [x] **A locale bug the dictionaries could not catch**: an English interface headed a card "VS JUILLET 2026", because `periodComparison` built its label with no locale and `Intl` fell back to the browser's.
- [x] **Then thirty more, in backticks.** The guard reads quoted strings, JSX text and ternaries; a template literal is none of those. `` `Budget ${money}` `` on every chart's reference line, the wishlist's three view tabs, "Cap €200", "Buy {item}", "Amount in USD", "Edit {name}" on four kinds of row, and the whole of `describeMarkSource`.
- [x] **And the sign-in screen's errors.** The API's own English sentences were shown verbatim — and the session-expired banner printed a raw `@auth.sessionExpired`, because the store writes a key so the message can be said in whatever language is chosen when it is *read*, and the card rendered it unresolved. The API answers with a stable code; the client now says it. Four uncoded server errors that users actually meet were given codes. Verified in the browser, in French.
- [x] **Each of the three shapes the guard knows about has its own test**, with a case that must match and a case that must not, so a rule cannot quietly stop working.
- [x] **~130 new keys across five languages**, and nine dropped as documentation.

### Less of everything

- [x] **Every figure read "€ EUR 1,400"** — the symbol *and* its ISO code, on a screen that names the display currency once at the top. The default is now the symbol.
- [x] **Six buttons per activity row became one and a menu** (`ui/RowMenu.tsx`: keyboard-driven, positioned `fixed` so a row's swipe overflow cannot clip it, destructive item separated). Nothing was removed — reordering, duplicating, deactivating and deleting are one press away, which is the right distance for a monthly action.
- [x] **Nine permanent controls at the foot of the navigation became two closed groups**, including a red *Reset all data* that had been one press from every page in the application.
- [x] **"· active" left every row that is not deactivated** (the deactivated ones carry a badge), and "· normal" left every row whose season is the default.
- [x] **Four chart subtitles that described the chart above them**, two section summaries and a heading printed twice twelve pixels apart, all removed.
- [x] **The dashboard's two sentences about money somebody else paid became two chips.**

### One vocabulary for who paid

- [x] **Named tokens** (`--funding-personal|other|outside`, each with `-text` and `-soft`) replace ad-hoc `--teal` and `--warning` at the call sites. Paid-by-other is now **blue**; it was teal, which reads as turquoise and says nothing.
- [x] **Three channels, always**: colour, glyph (● ◆ ▲) and word — so the states survive greyscale and colour blindness.
- [x] **The print inks are separated by lightness as well as hue**, because two blues of the same weight are one grey on a laser printer, and `tests/report-presentation.test.ts` measures the separation.

### The report reads like a dashboard

- [x] **A tinted hero band with the budget drawn as a length** — the one proportion on the page, and the reason it scans as a dashboard rather than as a list of numbers. Over-budget is a different colour *and* a hatch.
- [x] **The trend chart is hidden below two months of data.** A new account's first report drew one bar and eleven question marks, taking a fifth of the page to say it had no history.
- [x] **The detail grid went from thirteen cards to nine**, by removing the three that repeated the funding table two sections above; the treasury trio keeps its captions, because three balances in a row is exactly where a label alone does not say which is which.
- [x] **A coloured tab on every section heading**, with the rule underneath kept for when the colour is not printed.

### The tour, and "decide later"

- [x] **"Decide later" is offered on every card**, not only the first. Four steps in was exactly when there was a place worth returning to, and the only exit on offer was the one that discarded it.
- [x] **Closing the card postpones rather than refuses.** × and Escape mean "not now"; ending the offer is a decision with a labelled button.
- [x] **Verified end to end in the browser**: a task step refuses to advance until the task is genuinely done and still offers a way past; Later leaves a resumable reminder that survives a reload; dismissing the reminder ends it for good; and Skip leaves no reminder at all.

### Also

- [x] **About**, in Settings: name, version (substituted from `package.json` at build time, so it cannot drift), what it was built with, and a link to the source.
- [x] **Coherent versions.** The changelog had twenty date-headed sections and no numbers; it now has both, coarse on purpose, with a table saying what each release was for. `package.json` is 4.0.0.
- [x] **Exchange rates refresh when the application opens** — the fetch existed, was tested, and had no caller anywhere in `src/`. Age-based *and* publication-anchored, so opening the app is enough without hammering the provider.
- [x] **A CI failure the frontend build is structurally blind to**: `applyTheme` took an `HTMLElement`, and the API validates theme ids from that same module, so the server's TypeScript project compiles it — with no DOM library.
- [x] **Cleanup**: one orphan component, two unused dependencies, the old per-aircraft silhouettes, and eight documentation keys.

## Completed — 2026-08-29

### Identity, from the supplied artwork

- [x] **The Budget OS badge is the identity.** `assets/brand/app-icon-source.jpg` — a Concorde over a euro sign under a tricolour — is the master, and `scripts/build-icons.mjs` derives the favicon (ICO 16/32/48, PNG 32/96), the home-screen icons (192, 512), a maskable icon, the Apple touch icon and the in-app mark. Verified: the mark decodes on the sign-in card, and every size renders.
- [x] **The supplied JPEGs are cut out rather than keyed.** The badge arrived with its transparency flattened onto a checkerboard and the aircraft on a watercolour sky; neither can be removed by colour, because the badge's outlines use the same near-black the checkerboard does and the Concorde is as white as the sky's brightest area. `scripts/lib/cutout.mjs` flood-fills inward from the border with a predicate, keeps only the largest connected shape for the aircraft, and feathers the alpha so a JPEG's edge ramp dissolves rather than fringes.
- [x] **The A350 speck.** The A350 arrived with a mark below its tail that survived the flood fill as its own island and defeated every subsequent `-trim`, padding the finished asset by 40% of its height with empty space. The largest-component filter is why the asset is 560×587 rather than 560×839.
- [x] **The old identity is deleted**, not left beside the new one: `assets/brand/air-france-fin.jpg`, `public/brand/fin.png`, `public/aircraft.png`, `ui/FinMark.tsx` and `ui/AircraftMark.tsx`.
- [x] **Three aircraft, each derived twice**: full-colour artwork for the loading sequence and a flat white silhouette — from the artwork's own alpha, not redrawn — for the tab transition. All nose-right, because every animation here travels left to right. Verified in the browser: three distinct silhouettes, all decoding.

### The loading sequence

- [x] **A Patrouille de France formation.** The chosen aircraft holds the centre while two Alpha Jets orbit it on an ellipse, one trailing blue and one red; on ready they roll out of the turn and form up behind it, a third joins trailing white, the ribbons settle into a tricolour, and the formation accelerates right — the departure is what uncovers the application. Verified: the phase sequence `orbit → join → settle → depart → gone` runs on every load.
- [x] **Driven by `requestAnimationFrame`, deliberately.** The escorts must leave the orbit from wherever they are the instant the data arrives; a CSS animation cannot be interrupted and continued from its current value, and swapping animations snaps to the new one's first frame — a visible jump on the one screen every user sees.
- [x] **The narrative has a floor and the orbit does not.** A warm reload is ready in 150ms, and a formation join played in 150ms is a flicker. Join, settle and depart are fixed at ≈1.5s; only the orbit is elastic.
- [x] **Reduced motion is honoured by not animating at all** — the formation is simply there, and the screen leaves when the data does.
- [x] The lead aircraft is a preference, defaulting to Concorde, mirrored into `localStorage` because the loading screen runs before the snapshot exists.

### The transition

- [x] **The aircraft is the user's**, and the silhouettes are the supplied artwork treated as white icons rather than redrawn. Verified: choosing the A350 changes `/craft/a350-silhouette.png` in the sweep.
- [x] **Still left to right, always.** Re-verified by reading `animation-name` in both directions: `appSweepCover` / `craftRun` either way.
- [x] The craft is centred by `translateY(-50%)` rather than a fixed negative margin, because the three silhouettes have three different heights.

### Themes

- [x] **Six presets** — Air France, Concorde, Paper, Deep black, Alpine, Plum — each with a light and a dark map, plus **Light / Dark / System**, where System subscribes to `prefers-color-scheme` rather than reading it once.
- [x] **They are data, so they are measured.** `tests/theme-contrast.test.ts`: every text token against every surface, both appearances, every preset, WCAG AA. Plus a drift guard asserting the default preset and the stylesheet still agree — the stylesheet carries it so the app paints before any script runs.
- [x] **Deep black is dark by design** and says so: the appearance control is disabled rather than silently ignored. Verified in the browser: `#000000`, forced dark, control disabled.
- [x] The theme toggle in the header writes `appearance` *and* `darkMode`, so nothing that still reads the old boolean disagrees with the page.

### Translation: five languages, everywhere

- [x] **1,054 keys × 5 languages, with a test on both directions.** Every key the source asks for exists; every translated language covers the whole English key set.
- [x] **The reports are translated**, including their headings, labels, notes, month names, number formats, `<html lang>` and `dir="rtl"`.
- [x] **`domain/storedText.ts`.** The store writes `@audit.activityAdded|name=Padel` rather than an English sentence, and the interface resolves it in the language being read *now*. Values are percent-encoded so a category called "Food | Drink" cannot break the parse; anything the user typed never begins with `@` and passes through untouched; rows written before this keep their English (11 tests).
- [x] **`AuditLog.historicalPeriod` stores a token, not a label.** It stored `periodLabel(settings)`, so a record written in a French session read "juillet 2026" for ever. It stores `month:2026-07` and is formatted at read time.
- [x] **The audit summary is no longer suffixed.** `${summary} (historical edit · …)` would have corrupted a `@key|name=value` sigil by appending to its last parameter — and the same two facts are already on the record.
- [x] **Sentences built by concatenation are gone** from the activity preview, the schedule summary, the payment cycle, the health factors, the dashboard widgets, the wishlist priorities and the scenario diff. Each is a key with named values.
- [x] **`financialHealth` returns a grade id**, not an English adjective that was also a colour lookup key.
- [x] **The period label follows the chosen locale.** "August 2026" sat directly above "1 août 2026 – 31 août 2026"; both come from `Intl` against the same locale now.
- [x] Three `text-transform: capitalize` rules removed: they existed for interpolated lower-case English words, and turned "Mois en cours" into "Mois En Cours".
- [x] Numbers inside sentences go through the locale — "8,86", not "8.86".
- [x] "every 5 weeks" is one key per unit, because the French article agrees with the noun.

### No special categories

- [x] **Every piloting behaviour removed**: the separate budget total, `pilotIncludedInBudget`, the `generalTotal`/`pilotingTotal` split, the share-denominator exemption, the monthly-plan exclusion, the scenario boolean and the spending editor's `isPiloting` flag. Funding decides what costs this budget anything, for every activity and every transaction.
- [x] **Every category takes a share of the same total**, which is why the shares no longer need a footnote explaining why they do not sum to 100.
- [x] **The `bucket` field is no longer asked for.** A required four-way choice whose only behaviour was the one just deleted.
- [x] The stored fields stay declared and deprecated so records in the wild round-trip. Nothing reads them.

### The tour, made interactive

- [x] **Six of thirteen steps wait for the reader to do the thing** — pin a currency, add an activity, record a transaction, try paid-by-other, allocate a budget, save a scenario — with the tick read from the real snapshot rather than from a flag the tour sets for itself (22 tests).
- [x] **"Skip this step" beside every locked Next.** A tour that traps somebody is worse than one that teaches nothing.
- [x] **"Decide later" is a third answer.** It does not reopen the tour; a single dismissible reminder appears instead, resumable at the step it was left on. Dismissing the reminder ends it without ending the offer — Settings still has the button.

### Exchange rates, without a settings category

- [x] **Rates refresh when the application opens.** `fetchExchangeRates` existed, was unit-tested and had no caller anywhere in `src/` — a new account held no rates at all until somebody found the Currencies tab and pressed *Update now*. `refreshRatesOnOpen` now runs once per session after hydration.
- [x] **Nothing is written unless something changed.** Storing an identical rate set would bump the snapshot revision and push a sync to every other device, to record that nothing happened. The same guard covers repeated failures.
- [x] **A failed refresh is recorded, never disguised.** `ratesCheckedAt` and `ratesLastError` move; `ratesUpdatedAt` does not, so the pair sheet says *stale* or *failed* rather than presenting last week's numbers as today's (5 tests).
- [x] **Found by the browser, not by the tests**: React StrictMode mounts, unmounts and remounts the effect on the same fiber, so the once-per-session ref was already set when the second run arrived — and the first run's cleanup had cancelled the only fetch ever made. The unit tests passed throughout.
- [x] Exchange Rate Mode verified end to end: the warm overlay *and* a sentence saying what it is, unpin buttons withdrawn while it is on, two presses opening the pair with the rate in both directions, and a close that clears the picks.

### The second currency

- [x] An amount recorded in another currency shows its equivalent underneath, with the original as the primary figure.
- [x] **Absent whenever it would be a guess** — not configured, already in that currency, or no rate connecting the pair. `rateToBase` falls back to 1:1 to keep the interface rendering; printing that under a real transaction would state a fabricated figure as calmly as a real one (9 tests).

### The report, rebuilt

- [x] Sans-serif, a hero row of the four figures the report exists to give, the funding split as one proportional bar, compact tables, and notes reduced from four paragraphs to one or two lines.
- [x] **Black and white is still a tested property.** Each segment of the split bar keeps its border when the fill is dropped and carries its glyph and share inside it; ● ◆ ▲ and written labels survive; "over cap" is a word in a box; the emphasised card is distinguished by border weight (25 tests).
- [x] The health score is no longer printed twice on one page.

### Simplification

- [x] **Settings in five groups** rather than one column of eleven sections.
- [x] **The header lost five of its eight lines** — every one of them repeated by the period selector directly beneath it.
- [x] **The error screen is styled.** It used Tailwind utility classes this project has never had, so every one resolved to nothing: the one screen shown when something has already gone wrong was unstyled black text on white.
- [x] **Removed**: `budget-refactor-prompt/` (a snapshot from three refactors ago), `work/` (one-off diagnostics and a Playwright script), `new_chat.md`, a Windows `.lnk` with an absolute path, and thirty dead translation keys.

### The browser harness

- [x] **`scripts/lib/cdp.mjs`** — a CDP client over Node 22's WebSocket. Real mouse events rather than `element.click()`, because "can this actually be pressed" is the question a harness exists to answer; React-aware value setting, because `element.value = x` is invisible to React's value tracker.
- [x] **`scripts/verify-browser.mjs`** — a fresh account per run, and stable `data-tab` / `data-field` / `data-action` / `data-auth` hooks in the components, because labels are translated and text is not an address.
- [x] Deliberately no way to run one check in isolation: the checks are one session, and running the twelfth alone would test nothing and report a pass.

## In progress / next — current

- [ ] **Exercise the Neon HTTP driver's `sql.transaction([...])` specifically.** Production runs on it; the integration suite drives an adapter with the same interface, not the driver itself. *Not attempted in this pass on purpose: the only Neon instance available here is the owner's production database, and the suites drop and recreate their schemas. It needs a disposable Neon branch, which is the owner's to create.*
- [ ] **Deploy, and re-verify in production.** Everything from 2026-08-17 onward is unverified there. The Vercel check on a pull request from a fork reports "Authorization required to deploy" until the repository owner authorises it, and production tracks upstream `main` — so merging is the deploy.
- [x] Extend the browser harness to 390px and 320px, and to the dark themes. *(Done 2026-08-29.)*

## Discovered issues — open, current

- [ ] **The icon library's 244 icon *names* are English.** They are a search index rather than prose — the picker matches typed English keywords against them — and translating them is 244 nouns × 4 languages for something nobody reads as a sentence. *(Narrowed 2026-08-30: the sixteen category headings above them, and the "no icon matches" message, are translated. What is left is the index itself.)*
- [ ] **The Excel import's warnings are English.** They name English cell labels from the workbook they are describing ("the Budget sheet has no \"Activities\" header cell"), and the dialog is reached only when the user chooses a file. Recorded rather than silently accepted.
- [ ] **`sessionsPerMonth` and `sessionsPerPeriod` both describe a frequency.** Merging them would migrate every existing `perSession` activity, which is not worth doing for tidiness alone.
- [ ] **The wallet does not model transfers between currencies.** A movement has one currency and converts for display; moving €100 into a dollar wallet is two entries, not one.
- [ ] **Notifications are permission-only.** Nothing yet *schedules* a reminder: a real push pipeline needs VAPID keys and a server endpoint, and inventing one would be the "fake permission request" the brief forbids in another form.
- [ ] `xlsx@0.18.5` carries two high-severity advisories with no registry fix.

## Verified in a browser — 2026-08-30 (V4)

`node scripts/verify-browser.mjs` against a freshly started dev server and a
real PostgreSQL 17 database, on a brand-new account. **49/49.**

| Group | What it drives |
| --- | --- |
| Loading sequence | The five phases in order; an escort drawn **both** behind and in front of the lead; the smoke canvases sampled along a cut behind the formation and the bands read **blue, white, red** top to bottom; Concorde as the default lead |
| A brand-new account | The mark decodes on the sign-in card; a failed sign-in is reported in the reader's language rather than the server's English or a raw key; an account is created through the real form; the store the checks read is the one the page is using; the tour opens by itself at step 1 |
| The tour | A task step refuses to advance until the task is genuinely done, and still offers a way past; "Decide later" leaves a reminder that survives a reload; dismissing it ends it; Skip leaves none, reached through the replay button in Settings |
| Themes | All six presets applied and the painted background measured; the deep-black theme refusing a light appearance; the choice surviving a reload |
| Aircraft | Three drawings for the loading screen; **22 fleet silhouettes**, all distinct, all decoding, all from `/craft/fleet/`, all named for a screen reader, and over 98% of the opaque pixels measured white; choosing one changes the transition; both preferences default to Concorde |
| Transition | Left to right whichever way the tabs move |
| Period selector | Its popover on top of everything; the historical banner unable to steal a press; one press back to today |
| Second currency | Off until chosen; present under an amount in another currency and never under one already in it |
| Exchange rates | Fetched on open without anyone asking, or reported as failed; unconvertible currencies marked rather than silently dashed; exchange mode announced in words as well as colour; two presses showing the rate both ways; closing clearing the picks |
| Building a budget | The specification's gym — €20/session, 2 a week, paid every 10 — created through the real editor; the card stating the payment cycle; the total reaching the summary; a transaction landing in the period; money somebody else paid recorded in full and charged to nothing |
| Wallet | A budget allocation; three balances, not one; a reset that zeroes the money and keeps the records |
| Report | Generated, self-contained, in the interface's language |
| Small screens | No horizontal overflow and no target under 24px, on all eight tabs, at 390px and 320px |
| Contrast | Every text node against its real composited background on every tab, in Air France and Deep black: 0 failures |
| Console | 0 uncaught errors across the whole run |

## Verified in a browser, against real PostgreSQL — 2026-08-27

| Check | Result |
| --- | --- |
| A brand-new account | The tour opened by itself at **step 1 of 13**; the interface picked up French from the browser locale and the `fr` chunk loaded on demand |
| The tour drives the tab it describes | Step 3 switched the app to **Devises**; step 12 to **Réglages** |
| **`Notification.requestPermission()` is genuinely called** | Instrumented the real API: **called exactly once** from the button press, never on load. The app then reported "Les notifications sont actives." |
| The choice persists | `{"choice":"enabled","browserPermission":"granted"}` read back out of PostgreSQL, with `onboarding.completedAt` |
| The tour does not reappear | Closed after Finish and stayed closed |
| An activity paid by somebody else | Saved with the badge **"◆ Payé par un tiers · Papa"**; the optional payer field appears only for *paid by other* |
| The three-way split on Activities | Total €734.80/mo · Paid by me €534.80 (72.8%) · Paid by other €200 (27.2%) · Outside €0 (0.0%) |
| **Navigraph, August** | **Required in August = €523.00** — the rent only. The row reads "Rien à payer ce mois-ci" |
| **Navigraph, September** | **€604.64** (= €523 + €81.64). The row reads "€81,64 · Dû le 14 sept." beside "€6,80 /month avg." |
| An annual subscription with no renewal date | "Mois de paiement inconnu", excluded from the requirement, named in a note with its €5,00/month average |
| The activity selector follows the category | Health offered one activity; switching to Software re-scoped the list to three |
| An invalid selection is cleared, and said | "Cette activité n'appartient pas à la catégorie choisie : la sélection a été effacée." |
| The wishlist category swaps the selector | "Activité" disappears, "Article de la liste d'envies" replaces it |
| Selecting an activity adopts its funding | Choosing "Cours d'arabe" set *Paid by* to **Paid by other**, still overridable |
| Currency pinning | Search "swiss" → CHF; pinned; **double-tapped** → confirmation → unpinned |
| Unpinning what cannot be unpinned | EUR's button is disabled: "C'est votre devise d'affichage." |
| **Exchange mode** | Amber treatment, a banner naming the mode, **unpin buttons hidden** so a double-tap cannot unpin |
| Direction | EUR then USD → "**1 EUR = 1,19 USD**", inverse "1 USD = 0,84034 EUR"; Reverse → "1 USD = 0,84034 EUR" |
| Rate provenance | Updated-at and source shown honestly as "never fetched" / "Inconnu" |
| **§44, steps 1–2** | Activities require **€523,00** → planned monthly budget **€600,00** |
| **§44, steps 3–6** | Allocation recorded: wallet €600 · budget €600 · personal €0 |
| **§44, steps 7–9** | €100 spent: wallet €500 · budget €500 |
| **§44, steps 10–13** | €200 personal added: wallet €700 · budget €500 · personal €200 |
| **§44, steps 14–16** | €450 spent in total: wallet €350 · budget €150 · personal €200, and the leftover prompt appeared |
| **§44, steps 17–20** | Transferred €150: budget €0 · personal €350 · **wallet unchanged at €350** |
| **§44, steps 21–24** | September's €600 added: wallet €950 · budget €600 · personal €350, **and the plan still independently says €600** |
| The ledger epoch | A €350 spend back-dated *before* the first ledger entry was correctly ignored; moved after it, it applied |
| Budget month by month | September carried in from August; August showed allocated 600 / spent 450 / transferred 150 / remaining 0 |
| Scenario activities | Every activity got a checkbox and a funding dropdown; no mention of Piloting anywhere |
| Scenario count | "4 activités sur 4 activées" → "3 activités sur 4 activées" as one was disabled |
| A disabled scenario row | Dimmed, struck through, and its funding dropdown disabled |
| Scenario figures | Your monthly cost €5,00 · total €211,80 · paid by other €206,80 · "Appliquer (2 changements)" |
| Statistics shares | Loyer 71.2% · Cours d'arabe 27.2% · Navigraph 0.9% · Abonnement 0.7% — **100.0%** |
| Statistics funding split | Gross €8 818 · mine €6 418 (72.8%) · others €2 400 (27.2%) · outside €0 (0.0%) |
| **Deactivate on the desktop** | The button reads **"Désactiver"**, not "Hide"; total fell €734,80 → €211,80, the row gained a "Désactivée" badge and the button flipped to "Réactiver" |
| **Wallet reset** | Wallet €1 550 → **€0,00**, and budget and personal to €0,00; transactions and activities untouched |
| The report | Sections: health, summary, **who funded this period**, **activity costs**, trend, categories |
| The report's activity table | Navigraph "€0,00" in August · Abonnement "**not known**" · Loyer €523,00; shares sum to 100.0% |
| **The report in pure greyscale** | Every funding kind still identifiable by glyph (●◆▲) and written label; "Required in August" by border weight; "not known" in italics; "?" for months with no records |
| 390px and 320px, dark theme | **Zero** horizontal overflow and **zero** targets under 24px on Wallet, Currencies, Spending, Statistics and Activities |

### Defects the browser found, and fixed

Four of these are the reason browser verification is not optional: every one passed its unit tests.

- [x] **English months inside translated sentences.** "Nécessaire en August". `monthName()` is English-only; the panels now take month names from `Intl` via `monthNames()`. Re-verified: "NÉCESSAIRE EN AOÛT", and the wallet's month table reads "septembre 2026".
- [x] **The "why is the month unknown" sentences were hardcoded English** and printed as-is in a French interface. They are translation keys now, resolved by the panel — and by the English dictionary in the report, which is written in English by design. Re-verified in French.
- [x] **"3 of 4 activities enabled" on a French card.** `scenarioActivityCount` built a sentence in the domain. The interface now passes the two numbers to `t()`; the English label survives for the report and non-React callers. Re-verified: "3 activités sur 4 activées".
- [x] **The wallet ledger stored English sentences.** "Budget for August 2026" was written into the database, so it could never change language afterwards. The store writes `@key` sigils and the panel resolves them; anything the *user* typed passes through untouched. Rows written before the fix keep their stored text — rewriting saved records to change their wording would be worse than the bug. Re-verified: a new transfer renders fully in French.
- [x] **Reset wallet left the personal balance at −€600.** Zeroing the cash while the ledger still claimed €600 of budget money asserts a contradiction the user can see. The reset now releases the budget claim first. Re-verified: €1 550 / €600 / €950 → **0 / 0 / 0**.

## In progress / next — as of 2026-08-27 *(historical)*

- [ ] Exercise the Neon HTTP driver's `sql.transaction([...])` specifically. Production runs on it; the integration suite drives an adapter with the same interface, not the driver itself. *(Still open — see the current list above.)*
- [x] Automate the browser checks. *(Done 2026-08-29 — as `scripts/verify-browser.mjs`, driving Chrome over CDP directly rather than through Playwright.)*
- [x] Translate the reports, and finish translation coverage on the dashboard, analytics, wishlist, categories and history. *(Done 2026-08-29 — 1,087 keys in five languages, reports included.)*
- [ ] Deploy, and re-verify in production. *(Still open.)*

## Completed — 2026-08-27

Everything in this section is **implemented, covered by automated tests, and — except where noted — driven through a real browser**. See the verification table above.

### Funding: three classifications, not two and a label

- [x] **`domain/funding.ts` models three kinds, not a boolean.** `personal` (paid by me — in budget), `other` (paid by other) and `outside` (outside budget). The two exclusions share one behaviour — neither consumes the personal budget — and are never merged in any statistic, report or badge. The **stored values are unchanged** (`personal` / `shared` / `external`), so not one historical record was rewritten; only the words on screen changed (20 tests in `tests/funding-classification.test.ts`).
- [x] An unrecognised non-personal value from an old import reads as *paid by other*, never as *outside budget* — "gift" and "reimbursed" describe somebody else's money, and the weaker claim is the safe one.
- [x] `PeriodSummary`, `YearCalculation` and `FundingSplit` all carry the three figures plus the gross. `externalTotal` survives as the two exclusions added together, for the callers that genuinely only need "not mine".
- [x] **`includedBudget` is now the personal commitment**, not the gross. It previously overstated the monthly commitment by everything a parent, a club or an employer was paying for.
- [x] Each kind carries a colour **and** a glyph (● ◆ ▲) **and** a written label, so nothing depends on colour alone — which is what makes the printed report work (asserted in `tests/report-presentation.test.ts`).

### Activities: funding, real monthly requirements, and deactivation

- [x] **`Activity.fundingSource` and `Activity.fundedBy`.** A funding classification per activity, and an optional free-text name of whoever pays — "Dad", "the club", "work". Never required, never a predefined people database, and stored only for *paid by other* so switching an activity back cannot leave a stale name attached (migration `014`; repository round trip covered).
- [x] **`domain/activityBudget.ts`: the accrual and the requirement, kept apart.** €81.64/year is €6.80 a month *for comparison*, and €81.64 in September and nothing in the other eleven *as a cash requirement*. Both are reported; neither is derived from the other (28 tests in `tests/activity-budget.test.ts`).
- [x] **An activity whose payment month is unknown is never assigned one.** `status: "unknown"` with a `null` amount and a written reason, excluded from "required this month" and listed separately underneath. Checked across all twelve months for an undated annual subscription.
- [x] Every cost model answers the requirement question from its own real schedule: `fixedYearly` and `sessionPack` through `paymentsBetween`, `schedule` through the real occurrences, `fixed`/`perSession`/weekly/monthly as a genuine every-month commitment, `purchase` in the month it happens. No "monthly × 12" anywhere.
- [x] 29 February clamps to the 28th; a December renewal lands in December and a January one in January; twelve months of a €81.64 subscription sum to €81.64 exactly once.
- [x] **The Activities tab has a financial overview**: total activity cost, the three funding figures with their yearly totals and shares, and *Required in <month>* — with the unscheduled activities named beneath it rather than folded into it.
- [x] **Deactivate is a real action on the desktop.** The eye icon that only changed whether an activity appeared in summaries has been replaced by a labelled power control that switches the activity off and takes it out of every total. Hiding remains, in the editor and as a configurable swipe, and the two are described in different words in `domain/gestures.ts`.
- [x] **Deactivate is the default trailing swipe on mobile**, and asks before switching off (a budget that quietly drops by €60 is worse than one that asks) while never asking on the way back on.

### The month's budget requirement

- [x] **`monthlyBudgetPlan` is the single planning calculation.** The activity expenses genuinely required in the month, from real payment dates, rounded **up to the next hundred**: 523 → 600, 601 → 700, 1000 → 1000. `calculateSuggestedMonthlyBudget` delegates to it rather than keeping a second answer.
- [x] It previously summed monthly *accruals*, which averaged an annual subscription across twelve months and so suggested a budget too small in the month it renewed and too large in the other eleven.
- [x] Activities funded by somebody else, or kept outside the budget, are excluded from the amount to plan for: a budget is money this budget has to find.
- [x] Whether piloting counts now follows `pilotIncludedInBudget` rather than being excluded unconditionally — the old behaviour suggested a figure that could not cover a budget which *did* include it.

### The Wallet as a treasury (specification items 28–45)

- [x] **`domain/wallet.ts`: three derived balances, none of them stored.** `walletBalance` (every real movement, minus budget spending), `budgetRemaining` (allocations, minus budget spending, minus transfers out) and `personalBalance` (the subtraction of the two). A stored balance is a balance that can disagree with the movements that produced it (35 tests in `tests/wallet-treasury.test.ts`).
- [x] **The ledger has a start.** Spending affects the treasury only from the **epoch** — the date of the first ledger entry. Without it, a five-year-old budget opening the tab for the first time would be told it was tens of thousands overdrawn. Asserted directly.
- [x] **Time does not spend money.** A month ending consumes, resets and deletes nothing; leftover budget carries into the next month, across a year boundary, and a purchase in February can be paid from January's allocation.
- [x] **`createNextYearRecord` no longer manufactures an opening entry.** Correct while the wallet was a per-year figure, a straight double count now that the ledger is continuous.
- [x] **Budget allocations are explicit.** The plan says what the month needs; only the user can record that the money arrived. The suggestion is offered as a one-press default and never applied for them.
- [x] **Paid-by-other and outside-budget spending consume neither the wallet nor the budget**, while remaining fully visible in every spending figure. Money somebody else paid never entered this wallet, so it cannot leave it.
- [x] **A budget→personal transfer moves nothing.** Its effect on the wallet balance is zero by construction; it changes only how much is spoken for. Asserted that the wallet total is unchanged across a transfer.
- [x] **Leftover budget is offered, never taken.** Transfer it, keep it as budget money, or decide later — surfaced at the end of a period and again just before the next allocation, and dismissible for the session without touching the money.
- [x] **A month-by-month allocation history** with `carriedIn`, allocated, spent, transferred and remaining, so September visibly starts with what August did not spend.
- [x] **The wallet stays in step with spending**: a new transaction, a changed amount, a changed date, a changed funding classification and a deletion each recalculate correctly, and a deletion reverses the effect exactly.
- [x] **Multi-currency movements** convert through the app's own canonical rates and keep the amount and currency they were recorded in.
- [x] The full **twenty-four-step acceptance scenario of §44** runs as one test, end to end, including that the planning calculation still independently says $600 after funds from two budget periods coexist in the wallet.
- [x] Migration `015` adds `wallet_entries.date`, nullable and un-backfilled: a row written before it genuinely does not know its day, and `walletEntryDate()` reads it as the first of its month rather than inventing one.

### Spending: the activity selector

- [x] **The category chooses the selector.** A normal category offers its own activities; the wishlist category offers wishlist items; neither shows the other. The wishlist category is resolved by **seed key**, so renaming it cannot break the rule (11 tests in `tests/spending-activity-link.test.ts`).
- [x] **An invalid selection is cleared, and the user is told** — not silently retained, which would persist a relationship the interface says is impossible.
- [x] The activity's own funding becomes the transaction's default while still being overridable, because a lesson somebody else usually pays for is occasionally paid for by you.
- [x] The relationship is persisted on `spending_entries.activity_id` (a column that already existed and had no writer), survives a save and a reload, and is cleared on both sides when the activity is deleted.

### Scenarios, without a Piloting assumption

- [x] **The Piloting control is gone.** It assumed every budget has an activity of that name, could ask exactly one question about exactly one hard-coded thing, and did nothing at all for the overwhelming majority of users. `pilotIncludedInBudget` still round-trips on old scenarios but produces no change, is not previewed, and **is not applied** — applying a value the preview does not list would change a setting the user was never shown (21 tests in `tests/scenario-activities.test.ts`).
- [x] **Every activity gets enable/disable and a funding override**, stored in `ScenarioPreset.activityStates` (migration `014`). Absent means "enabled, own funding", which is exactly what every scenario saved before the change meant.
- [x] **"X of Y activities enabled"**, counted against the activities that *exist* rather than the ids a scenario happens to name — so a scenario mentioning three deleted activities cannot report a total nobody can see.
- [x] `scenarioProjection` implements the four rules: enabled + paid by me contributes; enabled + paid by other and enabled + outside budget are visible and contribute nothing; disabled contributes nothing at all.

### Currencies and exchange rates

- [x] **The whole of ISO 4217** — 160 currencies with names, symbols and their real minor units — replacing a hardcoded ten. The historical ten lead the list in their original order, so no existing budget's dropdown reshuffles (27 tests in `tests/currency-pinning.test.ts`).
- [x] **Only pinned currencies appear in dropdowns**, with a searchable picker as the explicit way to discover and pin more. Search matches code, English name and symbol, accent-folded.
- [x] Unpinning is refused for the display currency, the budget currency and any currency real records are stored in; re-pinning is simply pinning again.
- [x] **Currency-aware formatting**: the yen prints no decimals, the dinar three.
- [x] **One canonical rate representation.** Everything pivots through the euro, the two legacy manual pairs are folded into the same pivot, and any pair converts — GBP→CHF included. An unknown pair returns **null, not 1**: a rate of one for an unknown pair looks like a conversion and is a fabrication.
- [x] **Daily refresh at 12:00 UTC**, with the boundary as a first-class function so a test can check either side of it. A refresh is due when the stored set predates the most recent noon *or* exceeds the age guard (17 tests in `tests/exchange-schedule.test.ts`).
- [x] **A failed refresh never moves `ratesUpdatedAt`.** The last known good rates stay, the attempt is stamped separately in `ratesCheckedAt`, the reason is kept, and the panel reports "failed" rather than "stale" or "current". A success clears it.
- [x] **A Currencies tab**, with the exchange-rate controls inside it. The separate "Exchange rates" settings category is **removed**: which currencies a budget deals in and what they are worth were one subject on two screens, neither of which mentioned the other.
- [x] **Exchange mode** is a single state machine (`onCurrencyPress`), so a double-tap can never unpin while exchange mode is on and a tap can never select while it is off. First tap, second tap, then a popup stating the rate **in the direction they were tapped**, with the reciprocal, a reverse button, the timestamp and the source.
- [x] **Double-tap to unpin uses a 700 ms window**, not a 250 ms one — a finger does not hit a quarter-second reliably, and the cost of missing it is that a destructive action becomes unreachable. Safe because the second tap only opens a confirmation. An ordinary **Unpin button** does the same thing for anyone who cannot double-tap, always in the DOM and always visible on touch.

### Multi-language support

- [x] **A centralised translation layer.** One dictionary per language, one lookup, no strings in components (31 tests in `tests/i18n.test.ts`).
- [x] **Pluralisation through `Intl.PluralRules`**, not `n === 1`: French treats zero as singular, Arabic has six categories, and both are asserted. A language with one form supplies `_other` alone.
- [x] **Dates, numbers, percentages and lists through `Intl`**, against the chosen locale — so the whole app agrees on one locale rather than the browser's on one screen and the chosen language's on another.
- [x] **76 languages offered**, each naming itself, searchable by code, English name or native name. Five are translated (English, French, Spanish, German, Arabic); the rest are offered for their **locale formatting** and labelled as such rather than pretending a translation exists.
- [x] **Right-to-left is real**: `dir="rtl"` on the root, and the handful of rules that pin a side physically are mirrored.
- [x] **Only English is bundled.** The other four load as their own chunks when chosen — four dictionaries are ~25 kB gzipped, and four fifths of them are dead weight for any given reader. Until a chunk lands the interface is English rather than blank.
- [x] Two structural tests: every translated key exists in the English key set, and no translation invents a placeholder the original does not have.

### The first-run tour, and notifications

- [x] **A twelve-step tour** that switches to the tab each step describes, so the thing being explained is visible behind the words. Skip is a first-class control and records the same settled state finishing does; Escape leaves it; reduced motion is honoured by not adding the animation at all (13 tests in `tests/tutorial.test.ts`).
- [x] **It appears once, for a genuinely new account** — never completed, never skipped, and with no records of its own. An imported budget is not a new user.
- [x] **Reopenable from Settings**, which clears both marks so it runs from the top.
- [x] **`Notification.requestPermission()` is genuinely called.** The previous attempt shipped a permission-shaped component and never called it, so the browser was never asked; there is now exactly one function that performs the request and a test that asserts it was invoked (12 tests in `tests/notifications-permission.test.ts`).
- [x] It is reached only from a **user gesture**, from two places that explain first: the tour's notifications step and the Settings toggle. Nothing asks on load.
- [x] **Every answer is stored**, including a dismissed prompt — `Notification.permission` reports "default" for both "never asked" and "asked and dismissed", which is exactly the difference between a reasonable prompt and nagging.
- [x] **Denied and unsupported are handled and said out loud.** Once the browser has refused it is not asked again (that would be a button that silently does nothing); a browser with no `Notification` gets a control that does not pretend to work.

### The wallet reset

- [x] **Reset wallet sets the balance to exactly zero and touches nothing else** — not the transactions, not the activities, not the wishlist, not the account. Implemented as one balancing adjustment rather than a deletion: wallet entries record money that moved, and erasing them to make a figure read zero destroys history to fix a display (8 tests in `tests/wallet-reset.test.ts`).
- [x] It is behind a confirmation that says what survives it, is on the undo stack, is refused on a locked historical period, does nothing at all when the balance is already zero, and persists across a reload.

### Reports

- [x] **Rebuilt for print.** A serif masthead, structural rules, tabular figures, `break-inside: avoid` on rows and cards, a repeating table header, and the print button hidden when printing.
- [x] **Black and white is a tested property, not an intention.** Every funding line carries a glyph and a legend; "over cap" is a bordered word rather than a red bar; the emphasised card is distinguished by border *weight*; bars carry borders so they survive being unfilled. Ten assertions in `tests/report-presentation.test.ts`.
- [x] **The funding breakdown and the activity table** are in the report: monthly and yearly cost, share of the year, and *due in this month* — with "not known" printed for an activity whose payment month is unknown, and a note naming it.
- [x] The three treasury figures replace the single wallet total.
- [x] Still entirely self-contained: no `<link>`, no `<img>`, no external URL, and user text escaped (asserted).

## Not verified — as of 2026-08-27 *(historical)*

- [ ] Multi-device sync **in production**. Verified locally against PostgreSQL with two isolated contexts; the production instance has no data in it yet.
- [ ] Live exchange rates **from the production runtime**. The daily-schedule and failure semantics are unit-tested against a stubbed provider; the last real fetch from `open.er-api.com` was on 2026-08-21.
- [ ] Print/PDF output on a real printer **dialog**. The report was rendered and read back under a greyscale filter — which is what a monochrome printer does to it — and its black-and-white properties are asserted in tests. Nobody has pressed Print against a physical printer.
- [ ] Swipe gestures on a **physical touchscreen**.

## Discovered issues — open as of 2026-08-27 *(historical; closed items marked)*

- [x] **Reports are written in English only.** *(Closed 2026-08-29: `buildPeriodReport`/`reportHtml` take a translator, and the harness asserts a French report.)*
  Original note: the report model and its HTML are not translated: a French user gets a French interface and an English report. The activity "reason" keys are resolved against the English dictionary there deliberately, so nothing prints a raw key — but the section headings, summary labels and notes are English. Threading a translator through `buildPeriodReport`/`reportHtml` is the fix, and it is roughly forty more keys in five languages.
- [x] **Translation coverage is partial outside the panels this session touched.** *(Closed 2026-08-29: tests assert no missing, untranslated or unused keys in any of the five dictionaries.)* Original note: Navigation, activities, spending, currencies, the wallet, scenarios, the tour and the notification settings are translated. The dashboard, the analytics page, the wishlist, categories and history still carry English strings, and the period selector's "CURRENT PERIOD" / "Pending" / "Saved" chrome does too. The architecture is right — every one of these is a `t()` call and a dictionary row, not a rewrite.
- [x] **The first paint grew from 94 kB to 125 kB gzipped.** *(Closed 2026-08-29: the report, the workbook import and each non-English dictionary are separate chunks; the entry is 130 kB gzipped with considerably more in it.)* Original note: Measured. The four non-English dictionaries and the tour are code-split, and the remaining growth is the currency dataset, the 76-language list, the English dictionary and the new domain modules. Worth another pass; not worth blocking on.
- [ ] **`sessionsPerMonth` and `sessionsPerPeriod` both describe a frequency**, unchanged from the previous session.
- [ ] **The wallet does not model transfers between currencies.** A movement has one currency and converts for display; moving €100 into a dollar wallet is two entries, not one.
- [ ] **Notifications are permission-only.** The request, the stored choice, the states and a test notification all work; nothing yet *schedules* a reminder. No service worker and no push subscription — a real push pipeline needs VAPID keys and a server endpoint, and inventing one would be exactly the "fake permission request" the brief forbids in another form.
- [ ] `xlsx@0.18.5` carries two high-severity advisories with no registry fix, unchanged from the previous session.
- [x] No component or end-to-end tests beyond `tests/editor-typing.test.tsx`. *(Closed 2026-08-29: 42 browser checks, plus component tests.)*
- [x] `HorizontalBarChart` reserves a fixed minimum height, so a one-row breakdown leaves a tall empty card. *(Closed 2026-08-29: measured at 48px for a one-row chart — the reserved height had already gone.)*

## Discovered issues — closed 2026-08-27

- ~~The granular activity REST routes handled a subset of the model~~ → `POST`/`PATCH /api/activities` now accept the cost model, the funding classification and payer, the session-pack fields, weekdays, day-of-month and both dates, through one shared validator so the two routes cannot drift again. They still have no live caller; the client persists through `GET`/`PUT /api/snapshot`.
- ~~A dead `Notifications` toast component styled with Tailwind classes this project does not have~~ → deleted. It rendered `null` in every case because nothing ever mounted its provider, and its name collided with the real notification work.
- ~~`summarizeWallet` carried a deprecated `personalWalletTotal` alias~~ → removed; `personalBalance` is the only name.
- ~~The currency allow-list in the activities route was ten hardcoded codes~~ → imported from the dataset, like the settings route.
- ~~"Paid by others" and "outside my budget" behaved identically and were reported as one~~ → three kinds, separate everywhere.
- ~~The suggested budget averaged annual subscriptions across twelve months~~ → the real requirement for the month.
- ~~`includedBudget` charged the personal budget for activities somebody else pays for~~ → personal only.
- ~~The spending editor offered a wishlist dropdown on every category and never offered activities~~ → the category chooses the selector.
- ~~Scenarios assumed a "Piloting" activity~~ → generic per-activity enable and funding.
- ~~Ten hardcoded currencies~~ → the whole of ISO 4217, pinned subset in dropdowns.
- ~~Exchange rates were a separate Settings category with no connection to the currency list~~ → both in the Currencies tab.
- ~~A failed rate refresh was indistinguishable from a successful one~~ → `ratesCheckedAt` and `ratesLastError`, reported as "failed".
- ~~Every string was hardcoded in its component~~ → a translation layer with real plural rules.
- ~~The notification permission request was never called~~ → one function, two gestures, and a test that asserts the call.
- ~~The wallet was a single figure that reset each year and answered no question about real money~~ → a treasury with three derived balances and a ledger.
- ~~`Hide` was the desktop stand-in for deactivating an activity~~ → a labelled power control; the two concepts are now described in different words.

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
