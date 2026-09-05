# MR International 2.0 — Phase Log

Working log for the 5.1–5.18 program. One section per phase, appended as each
phase completes. Do not compress or reorder — see the brief for why.

---

## Phase 5.1 — Deep Mr International user experiment

**Date:** 2026-09-05
**Environment:** local dev stack (`scripts/dev-server-local-pg.mjs` on :3001
against disposable Postgres db `budget_mrintl_2026`, `npm run dev` on :5173),
fresh account `mrinternational.test@example.com`, real signup (no seed data).

### Implementation
None — observation phase only.

### Tests
Full first-time-user walkthrough in a real Chrome (chrome-devtools MCP),
desktop (1440×900) and mobile (390×844): signup → 13-step interactive
tutorial (every step, including the currency-pinning and activity-creation
gated steps) → dashboard empty state → recurring activity creation → three
funding-state transactions (paid-by-me, paid-by-other, outside-budget) →
wallet fund deposit → wallet personal-money entry → month close (with
carry-over) → statistics → reports → scenarios → settings tabs → logout →
login → refresh.

### Results

🔴 **Confirmed bugs**

1. **NaN on the Spending page.** The "PAYÉ PAR MOI" summary tile shows the
   literal string `NaN` instead of `€0,00` whenever the period has zero
   "paid by me" transactions (its siblings "PAYÉ PAR UN TIERS" and "HORS
   BUDGET" correctly show `€0,00`/`—` at zero). Reproduced twice. Some
   average- or ratio-style calculation is dividing by a zero count instead
   of guarding it.
2. **Dashboard "RESTANT" disagrees with the Wallet's "BUDGET RESTANT."**
   Same account, same month: Wallet page reports `BUDGET RESTANT: €75,00`
   (consistent with its own APPORTÉ/DÉPENSÉ table), but the Dashboard KPI
   right above it reports `RESTANT: —` / "Aucun budget mensuel défini" —
   as if no money existed at all. This is the clearest lead on the brief's
   hypothesized Remaining-Budget bug; deep-dive assigned to Phase 5.2.
3. **Month-close debits the wrong pot.** Closing September with a recorded
   "écart de fin de mois" of `−€25,00` and choosing "Clôturer et reporter"
   posted a `−€25,00` "Report de fin de mois" wallet entry that came out of
   **Personal Balance** (€40→€15), not Remaining Budget (stayed €75,00).
   Follow-up: deleting the €25 "paid by me" transaction afterwards correctly
   zeroed DÉPENSÉ and restored Remaining Budget to €100 everywhere (Wallet
   page total and the "Budget par mois" row agreed) — so the per-month table
   isn't stale, it simply never reflects wallet-ledger-only entries (Report
   de fin de mois, Argent personnel) by design, only actual transactions.
   The open question is narrower than first thought: why does a shortfall
   against an *unset* monthly budget cap get taken out of Personal Balance
   at all, and where does the −25 figure itself come from. Also assigned to
   Phase 5.2.
4. **Mislabeled required field.** The wallet's "Enregistrer une entrée ou
   une sortie" dialog has a required text field labelled **"Total"** whose
   placeholder ("Salaire, retrait d'espèces…") shows it's actually a
   free-text label — redundant with the "Note" field directly below it.
   Smells like the same i18n-key-mismatch class of bug documented in
   `docs/KNOWN_ISSUES.md`'s "Resolved 2026-08-29" section.

🟡 **Minor / needs a decision, not urgent**

5. A brand-new account already has 10 currencies pre-pinned (EUR, USD, LBP,
   GBP, CAD, AUD, JPY, TRY, SAR, AED), which undercuts the tutorial's "pin a
   currency you actually use" framing (there's nothing to search for that
   isn't already pinned).
6. Scenario naming uses a native browser `prompt()` dialog — unstyled,
   inconsistent with the rest of the app's editors.
7. Statistics' month-by-month history labels not-yet-arrived future months
   (e.g. October–December when viewing September) as "EN COURS" (in
   progress) rather than something like "upcoming."
8. Dashboard for a month with only a carried-over wallet entry (no real
   spending yet) shows "DÉPENSÉ · Aucune donnée" but "1 transaction" right
   below it — contradictory at a glance; likely the transaction count isn't
   scoped the same way as the amount.
9. Three parallel "how much should my budget be" concepts coexist with no
   visible relationship: `Réglages > Argent` "Budget mensuel" (a setting,
   left at 0 in this test and never surfaced again), the Wallet page's
   "PRÉVU POUR [mois]" (a suggestion derived from recurring activities,
   captioned "un plan, pas de l'argent que vous avez"), and the Dashboard's
   "Budget mensuel suggéré" card with Approve/Passer. A new user has no way
   to know these are related, or how "Approve" changes anything. Likely the
   single biggest driver behind bug #2. Assigned to Phase 5.13
   (conceptual bridge) once 5.2's root cause is in.

🟢 **Confirmed strengths — do not regress**

- The interactive tutorial is genuinely interactive: real DOM-anchored
  highlight boxes tracked the actual target button through two page
  navigations (Réglages tab switch, Activités→Dépenses→Portefeuille), and
  gated steps (pin a currency, add an activity, record a transaction, add
  wallet money) correctly stayed blocked until the real action completed,
  then auto-detected it.
- Contextual microcopy for funding states appears exactly where it
  matters, e.g. selecting "Payé par quelqu'un d'autre" or "Hors budget" in
  the transaction editor immediately explains the consequence in one
  sentence ("cela ne touche jamais votre budget" / "volontairement tenu à
  l'écart de ce budget").
- For every mutation actually tried (add wallet money, spend paid-by-me,
  add personal money), Wallet = Remaining Budget + Personal Balance held
  exactly, and paid-by-other/outside-budget transactions correctly left
  all three untouched.
- Mobile layout (390×844) had no overflow, no clipping, adequate touch
  targets, and a well-designed empty state ("PAS ASSEZ DE DONNÉES" gauge)
  on both Dashboard and Wallet.
- Logout → login → refresh round-trip preserved all data with no blank
  state and no 409 — the historical session-restoration bug did not
  reproduce in this basic pass (targeted retry scheduled for Phase 5.17).
- Signup flow is minimal (email, password with a sane length-over-symbols
  hint, optional invite code) with no email-verification friction.

### Confirmed context for later phases
- No "Remember me" checkbox on login (Phase 5.11 starts from scratch).
- No username login option, email only (Phase 5.12 starts from scratch).
- No self-service account deletion in `Réglages > Compte` — only change
  email, change password, sign out, and "Revoir le guide" (Phase 5.17).

### Regression
N/A — no code changed this phase.

### Remaining concerns
- The 409/session-restoration issue from the original experiment did not
  reproduce here; needs a more targeted repro (concurrent tabs, or a
  disposable-account-specific race) in Phase 5.17.
- Haven't yet exercised: editing/deleting an existing expense, recurring
  activity edit after the fact, Wishlist, Excel import, multi-currency
  transaction display, Categories page, or the "Interaction"/"Données"
  settings tabs. Will cover opportunistically in later phases that touch
  those areas (5.3 responsive pass, 5.15 recurring activities, 5.16
  outside-budget model).

---

## Phase 5.2 — Wallet / Remaining Budget / Personal Balance root-cause

**Date:** 2026-09-05
**Environment:** same as 5.1, continuing on the same test account and data.

### Investigation

Traced all three balances to their source (`src/domain/wallet.ts`'s module
header is itself the map: wallet balance = every ledger movement minus
budget spending; budget remaining = allocations minus budget spending minus
transfers; personal balance = wallet balance − budget remaining, "the third
being a subtraction is the point"). Confirmed empirically in 5.1 that this
arithmetic holds for every ledger mutation tried.

**Why Main Wallet is correct:** `WalletPanel.tsx` and the Dashboard's own
wallet-balance card both read the same ledger-derived `walletState()` /
`calculation.wallet.walletTotal` — one source, already unified in a prior
pass (the Dashboard card carries an explicit comment documenting this).

**Root causes found, one per 5.1 finding:**

1. **Dashboard "RESTANT" vs Wallet "BUDGET RESTANT."** Not a calculation
   bug. `wallet.ts`'s header states these are two *deliberately* different
   concepts: "Planning" (`budgetPacing()` in `src/domain/analytics.ts`,
   `settings.monthlyBudget − spent`, an approved cap) vs. "Treasury" (this
   module's ledger-derived figure) — "not the same number and not meant to
   converge." The bug is that `Dashboard.tsx:429` borrowed the ambiguous
   `wallet.remaining` i18n key for the Planning tile, and its empty-state
   copy ("no monthly budget defined") wrongly implied no budget money
   existed at all when Treasury had a healthy positive balance.
2. **Personal Balance divergence.** No separate Dashboard figure exists for
   it, so no display-divergence surface — its corruption showed up only via
   item 5 below.
3. **NaN.** `src/domain/currency.ts:286` — `formatMoney` literally
   `return`ed the string `"NaN"` for a null/NaN amount, rather than the
   app's own "—" convention used everywhere else for empty money. The three
   sibling spending tiles are shielded from this by `formatDualMoney`'s own
   null guard; the "Payé par moi" tile alone calls `formatMoney` directly.
4. **Mislabeled "Total" field.** `WalletPanel.tsx:813` used the shared
   `common.total` key for what is actually the ledger entry's descriptive
   title (`WalletEntry.source`) — the same field rendered as "Pharmacie" /
   "Cadeau" / "Budget de September 2026" in the ledger history. No dedicated
   label key existed for it.
5. **Month-close "écart."** `calculateRolloverDelta()`
   (`src/domain/calculations.ts:375`) computes `settings.monthlyBudget −
   spent` — the same Planning figure as item 1 — and `closeMonth()`
   (`src/store/budgetStore.ts:1102`) posts it as a `type: "rollover"` wallet
   entry. `walletEffect()` counts every non-transfer entry as real cash
   movement, but `budgetEffect()` only recognizes `"budget"`/`"transfer"` —
   so a rollover entry silently drains/credits **Personal Balance**
   (`personalBalance = walletTotal − budgetRemaining`) rather than
   Remaining Budget, and `budgetPeriods()` (the "Budget par mois" table)
   skips it entirely for the same reason.

### Product decision

Put the month-close question to the project owner directly, since nothing
in the code or docs states an intended policy and both readings are
defensible: **confirmed as intended** — overspending your approved monthly
cap is meant to be charged to Personal Balance (money that's "yours," not
the budget's), and underspending is meant to roll into Personal Balance as
a reward; Remaining Budget (real wallet cash) is correctly left untouched
because it is a separate, already-continuous ledger that never needs a
close-month step. **No calculation change made for this item.** What's
still wrong is purely communication — the close dialog doesn't say where
the money is going, and the "Budget par mois" table looks stale next to it
— both assigned to Phase 5.14 (Month Close UX).

### Implementation

Fixed the three items that were genuinely bugs, each the smallest change
that corrects it without touching wallet.ts's architecture:

- `src/domain/currency.ts:286` — `formatMoney` now returns `"—"` instead of
  the literal string `"NaN"` for a null/NaN amount.
- `src/components/wallet/WalletPanel.tsx:813` — the entry-label field now
  uses a new `wallet.entryLabel` key ("Libellé"/"Label"/etc.) instead of
  `common.total`, added across all 5 locale files (en/fr/de/es/ar).
- `src/components/dashboard/Dashboard.tsx:429` — the Planning-cap tile now
  uses a new `dashboard.approvedBudgetRemaining` key instead of borrowing
  `wallet.remaining` (same visible text today, but no longer the same key
  as the Wallet tab's Treasury figure, so Phase 5.13 can word them
  differently without touching the Wallet tab). Its empty-state caption
  (`dashboard.noMonthlyBudget`, all 5 locales) now reads "No monthly
  spending cap approved" rather than implying no budget money exists.

Left untouched, deliberately: `wallet.ts`'s three-balance arithmetic,
`budgetPeriods()`'s automatic carry-forward, `calculateRolloverDelta()`,
and `closeMonth()`'s rollover entry — all confirmed correct or intended.

### Tests

- `npx tsc -b` — clean.
- `npx vitest run` — 1044 passed, 83 skipped (pre-existing skips), 0
  failed, across all 58 non-skipped test files.
- `node scripts/verify-browser.mjs --url http://localhost:5173` — 66/66
  browser checks passed (tour, themes, aircraft, wallet, second currency,
  reports, small screens 320–430px, contrast, console).
- `node scripts/verify-tutorial.mjs --url http://localhost:5173` — 12/12
  passed.
- Manually re-verified in the running app: "Payé par moi" now shows "—" at
  zero transactions; the Dashboard caption reads "Aucun plafond mensuel
  approuvé"; the wallet entry dialog's field now reads "Libellé".

### Regression

Full existing suites above all still pass; no other screen references the
three changed i18n keys or the changed `formatMoney` branch's old string
value (`common.total`, `wallet.remaining` usages other than the two named
sites, and the literal `"NaN"` were each individually grepped before
editing).

### Remaining concerns

- Phase 5.13 should design the actual conceptual bridge between Planning
  and Treasury (the "approve a suggested budget" flow vs. the wallet's own
  deposits) — this phase only fixed the mislabeling, not the underlying
  comprehension gap.
- Phase 5.14 owns the close-month dialog/copy fix now that the "écart"
  policy itself is confirmed correct.
- Two 5.1 minor findings (native `prompt()`/`confirm()` dialogs for
  scenario naming and transaction deletion; "EN COURS" on unstarted future
  months; the contradictory "Aucune donnée · 1 transaction" pairing on a
  month with only a wallet-ledger entry) remain open, assigned to later
  visual-language/UX phases (5.4, 5.14).

---

## Phase 5.3 — Responsive / mobile user experience

**Date:** 2026-09-05
**Environment:** same account and data, chrome-devtools MCP, viewport
resized live (no device emulation quirks) at 390×844, 768×1024, and back to
1440×900 desktop, plus the project's own harness at 320/360/375/390/412/430.

### Tests

Walked Dashboard, Activities (list + "Nouvelle activité" full editor),
Spending, Wallet (balances, wallet-entry-history table, "entrée/sortie"
dialog), Reports (including its embedded iframe's own internal scroll),
Statistics → Historique financier, Categories, all four Settings tabs, the
mobile "Plus" sheet, and a full tutorial replay — at 390px. Spot-checked
768px (tablet portrait) on the Dashboard specifically to confirm the
mobile↔sidebar breakpoint (748/2759 in `src/styles-extras.css`, is `max-width:
780px`) was landing where intended rather than by accident.

### Results

🔴 **Bugs found while testing responsiveness (not layout bugs themselves,
found by reading real content on real screens):**

1. Wallet ledger rows and two audit-log sentence types stored raw English
   month names (`Budget de September 2026`), and the Statistics
   "Historique financier" list rendered its own month labels in English
   outright. Two entirely missing translation keys (`audit.noteWritten`,
   `audit.noteCleared`) meant writing or clearing a monthly note logged the
   literal key name. See the commit for the full fix — this turned out to
   be the same "sentence translated, values inside it were not" defect
   class `docs/KNOWN_ISSUES.md` already documents once; this is where it
   had not yet been caught.
2. Four hardcoded English "Cancel" buttons (History's note editor, Account
   settings, the historical-period-edit confirmation, Wishlist's editor)
   next to dozens of correctly-translated ones using the same
   `common.cancel` key. Fixed to match.

🟢 **Responsive layout itself: no confirmed defects.** Specifically checked
and clean:

- No horizontal overflow or sub-24px touch target anywhere from 320–430px
  (harness) or manually at 390px across every screen listed above.
- The "Budget par mois" table (6 columns) scrolls inside its own bounded
  horizontal scrollbar rather than pushing the page wide — the correct
  pattern, already in place.
- The tutorial overlay's highlight box tracked its real target correctly
  through a tab switch at 390px, with the card never covering the control
  (confirmed both visually and by the existing `verify-tutorial.mjs`
  harness, 12/12).
- The Report's iframe correctly reflows its tables to the narrow width
  with no clipping; it does use its own internal scroll (nested inside the
  outer page's scroll) rather than expanding to fit content, which is a
  reasonable bounded-preview pattern, not a defect.
- Dialogs/editors (activity creation, category list, wallet entry) render
  as full-width sheets with sticky footers on mobile — no cramped controls.
- 768px correctly still renders the mobile (bottom-nav, single-column)
  layout rather than an awkward in-between state, which is intentional
  (the sidebar breakpoint is 780px).

One thing that looked like a bug and was not, recorded so it is not
re-investigated: the Report's "BUDGET RESTANT" figure appeared as
"€100.00" (period, not comma) in a screenshot; direct DOM inspection of the
live iframe confirmed it actually reads "€ 100,00" — a rendering/reading
artifact at that zoom level, not a formatting defect.

### Implementation

See the "fix: a wallet deposit remembered September in English forever"
commit — domain/i18n.ts, budgetStore.ts, HistoryPanel.tsx, three other
components' Cancel buttons, and all 5 locale files.

### Tests (fix verification)

`npx tsc -b` clean; `npx vitest run` 1044 passed/83 skipped/0 failed;
`verify-browser.mjs` 66/66; manually confirmed in the running app that a
freshly-created wallet allocation, the Historique financier month list, and
the note-field aria-label all now read in French.

### Regression

Full suites above cover it; no other consumer of the changed keys or of
`period.label` was found via grep before editing.

### Remaining concerns

- Did not test RTL (Arabic) layout at mobile widths — worth a pass whenever
  accessibility (5.17) or visual language (5.4) work touches direction-
  sensitive CSS, since this phase only exercised LTR (French).
- Did not exhaustively test every dialog in the app at mobile width (e.g.
  Wishlist's editor, Excel import preview) — covered the highest-traffic
  ones; will pick up any stragglers opportunistically in later phases that
  touch those features directly.

---

## Phase 5.4 — Visual language validation and refinement

**Date:** 2026-09-05
**Environment:** same account, desktop 1440×900, light and dark themes.

### Investigation

Read `docs/DESIGN_SYSTEM.md` in full first — it already documents a mature,
measured system (a real contrast sweep across ten tabs and both themes at
zero failures, a semantic colour table with `-text` variants for the
4.5:1 problem, tabular numerals on every money figure, a fixed-direction
motion system, a documented icon-resolution order). The mandate here is
"preserve the successful funding-state system" and "do not regress into
colour-only communication," so the job was to verify that mature system
still holds under real content, not to re-derive it from scratch.

### Tests

Toggled light↔dark on Dashboard, Wallet, and re-checked the funding-state
triple-channel (colour + icon + label) on every card and badge already
captured in earlier phases' screenshots. Swept the codebase for the same
"hardcoded-English-string" defect class Phase 5.3 found, since it is a
visual-language issue as much as a translation one — a single untranslated
word breaks the typographic consistency of an otherwise fully-localized
screen.

### Results

🔴 **Confirmed bugs** (same defect class as 5.3, different screens — a
prior localization pass evidently didn't reach these three):

1. Dashboard's primary "Approve" button on the suggested-budget card — the
   most prominent call-to-action on the busiest screen in the app — was
   hardcoded English next to a correctly-translated "Passer" right beside
   it. No `common.approve` key existed at all; added it to all 5 locales.
2. Dashboard's "Personnaliser ce tableau de bord" editor's "Done" button.
3. Two "Delete" confirmation buttons in the Scenario Lab (preset delete,
   season delete). Both `common.done` and `common.delete` already existed
   and are used correctly everywhere else — these two call sites just
   never picked them up.

A grep sweep for the same shape (`^\s*Word\s*$` inside JSX, across every
component) after fixing these five found nothing further.

🟢 **Visual language: no regressions, nothing to change.**

- Funding states (Payé par moi / Payé par un tiers / Hors budget) carry
  colour, a distinct icon (circle / diamond / triangle), and a text label
  together on every screen checked — Dashboard, Wallet ledger history, and
  the tone-card badges. Colour is never the only signal.
- Dark mode: soft near-black surfaces (never pure black), the same
  three-rail treasury cards, correctly re-tinted status badges, tabular
  numerals aligned in the "Budget par mois" table — matches the design
  doc's dark-mode requirements exactly.
- Empty states (the Concorde silhouette, the "PAS ASSEZ DE DONNÉES" gauge)
  render identically in both themes with no missing assets or contrast
  loss.

### Implementation

`common.approve` added to all 5 locale files; `Dashboard.tsx`'s "Approve"
and "Done" buttons and `ScenarioLab.tsx`'s two "Delete" buttons now call
`t(...)` with existing or new keys.

### Tests (fix verification)

`npx tsc -b` clean; `npx vitest run` 1044 passed/0 failed; manually
confirmed "Approuver" now renders in place of "Approve" on the Dashboard.

### Regression

No CSS, token, or component-structure changes this phase — pure text-layer
fixes, so no visual regression surface beyond the five strings touched.

### Remaining concerns

- None new. The two open 5.1 minor items (native `prompt()`/`confirm()`
  dialogs, "EN COURS" wording) remain queued for 5.14/later polish, as
  before — they're interaction/wording choices, not defects.

---

## Phase 5.5 — Expanded activity iconography

**Date:** 2026-09-05
**Environment:** same account, desktop 1440×900.

### Investigation

Read `src/components/ui/IconPicker.tsx` in full before adding anything —
251 icon options across 17 categories already exist, every one a real
`lucide-react` export chosen deliberately (a documented decision record
explains why brand logos are never drawn, why the mark-resolution order is
fixed, and why an icon may deliberately appear in more than one group).
Cross-referenced the brief's full requested list — sports, transport,
food, home, medical, subscriptions, family, salary, investment, etc. —
against this existing set, item by item, rather than assuming a gap:

- **Already covered, verified by name or keyword:** swimming (Waves), gym
  (Dumbbell), running (Footprints), cycling (Bike), skiing
  (MountainSnow/Snowflake), hiking (Mountain/TentTree), airplane/train/
  bus/car/fuel (Transportation), taxi (`Car`'s own keywords already say
  "taxi uber"), hotel, restaurant, coffee, groceries, shopping, cinema,
  gaming, music, books, school, university, medical, pharmacy, phone,
  internet, electricity, water, rent/home, tools, subscriptions, travel,
  luggage, pets, gifts, family, childcare, clothing, electronics,
  software, cloud services, work, and — via `Banknote`'s existing
  keywords — salary. Tennis racket / table-tennis / football / basketball
  are already searchable through `Volleyball` ("Ball sport") and
  `CircleDot` ("Court sport")'s keyword lists, and `Goal` covers football/
  soccer by name.
- **Not available anywhere in the library** (checked the installed
  `lucide-react@0.468.0`, the newest `0.x` release `0.577.0`, and the
  current `1.41.0` — none of the three ship it): a gun, pistol, or rifle
  icon. Per this app's own documented icon philosophy ("avoid mixing icon
  libraries," brand marks are never hand-drawn) and the brief's own
  instruction not to import a library just for this, no substitute was
  added — `Target`'s existing keywords already include "shooting", so a
  shooting-range or similar activity is already findable without a
  literal weapon glyph, which also keeps the set in line with the calm,
  premium tone the design system asks for.
- **Genuinely missing:** a general insurance icon (health insurance had a
  keyword on `HeartPulse`, but car/home/life insurance had nothing), and a
  dedicated salary/income icon distinct from generic cash.

---

## Phase 5.6 — Thylacine pilot interactive tutorial

**Date:** 2026-09-05
**Environment:** same account, desktop 1440×900 and mobile 390×844.

### Investigation

Read `Tutorial.tsx` and `domain/tutorial.ts` in full first — the tour is
already a data-driven, 13-step, task-gated walkthrough (documented at
length in its own header comment) with a spotlight that anchors to real
DOM rects. The brief for this phase is specifically the *character*: a
consistent illustrated guide across a fixed set of poses, not a rebuild of
the tour mechanics.

### Implementation

Drafted the character outside the app first (`scratchpad/thylacine-
draft*.html`, `thylacine-poses.html`) to iterate on the drawing without a
rebuild loop, checking each version in a real browser before writing any
React:

- Draft 1 (a quadruped-ish stance, arms the same fill colour as the body)
  was rejected on sight — the arms were invisible against the torso and
  the pilot cap read as an odd brown blob rather than a helmet.
- Draft 2 added a consistent stroke outline to every shape (the fix for
  "arms invisible against the body"), an upright stance with the two arms
  free to gesture, ear flaps that actually separate from the head, and a
  tricolour scarf tying the character to the app's own identity. This is
  the design that shipped.
- Verified all 10 required poses (neutral, waving, pointing ×4, explaining,
  thinking, warning, celebrating) render clearly at a glance before writing
  the component — one pose ("pointing down") didn't read as a downward
  point on the first attempt (the arm looked like a resting neutral arm)
  and was redrawn to extend the arm past the feet.

Built as `src/components/onboarding/Thylacine.tsx`: one shared body/head/
cap/goggles/scarf, a `pose` prop that swaps in only the arms, eyes and
(for two poses) an open mouth or sparkle marks. Colours are fixed literals
rather than theme tokens, matching the existing precedent for brand
artwork (`docs/DESIGN_SYSTEM.md`'s tricolour band and the loading-screen
aircraft) — the guide should look the same in a custom purple theme as in
the default one.

Wired into `Tutorial.tsx` via a `STEP_POSE` map keyed by step id (waving on
welcome, thinking on the two nuance-only steps, pointing-right as the
default for task steps, pointing-up on the notifications step, celebrating
on the last step, explaining elsewhere) and a new `.tutorial-character-row`
that sits the 56px (44px on phones, `max-width: 480px`) character beside
the step title.

### Tests

`npx tsc -b` clean; `npx vitest run` 1044 passed/0 failed;
`verify-tutorial.mjs` 12/12; `verify-browser.mjs` 66/66. Manually walked
the full 13-step tour end to end at both 1440px and 390px, checking the
character on the welcome (waving), dashboard (explaining), currencies
(pointing-right, mid-tab-switch), notifications (pointing-up) and final
(celebrating) steps — legible and correctly posed at both sizes, no layout
shift or card-width regression on the narrower anchored-card path.

### Regression

Purely additive: no existing tutorial markup, CSS class, or step data was
changed beyond the two intentional additions (the character row, the
`STEP_POSE` map). The harnesses' own DOM-hook assertions (`data-step`,
`data-task-done`) are untouched.

### Remaining concerns

- The character is currently only used in the onboarding tour. If a later
  phase wants it elsewhere (an empty-state illustration, an error page),
  the component already supports that — it takes no tour-specific props.
- Colours are fixed literals, so a custom theme user never sees their own
  accent colour reflected in the guide. Confirmed as consistent with the
  tricolour band's own precedent rather than an oversight.

---

## Phase 5.7 — Tutorial targeting / overlay positioning

**Date:** 2026-09-05
**Environment:** same account, desktop, live viewport resizes via
chrome-devtools MCP (not device emulation — an actual CDP viewport change,
which fires the same `resize` event a real window drag does).

### Investigation

Re-read `Tutorial.tsx`'s placement effect before assuming the brief's
premise. The mechanism is already exactly what the brief asks for —
`getBoundingClientRect()` on the real target, re-measured on scroll,
resize, and a `MutationObserver` for layout changes triggered by the tour
itself — and `verify-tutorial.mjs` already asserts "does not put the card
over the control" and passed 12/12 going into this phase. So the question
was whether a real gap still existed, not which pixel offset to hardcode.

### Reproduction

Opened the "funding" step (an anchor step that stays lit whether or not
its task is done) at 1440×900, then resized the live viewport down to
1000×700 — a same-window resize, not a device switch. Confirmed via
`getBoundingClientRect()` on both elements that the tutorial card's box
(628,109)–(988,565) fully contained the spotlighted edit button's box
(869,579)–(905,611): the card was rendered directly on top of the control
it was supposed to leave clickable, exactly the class of bug this phase
names.

### Root cause

`Tutorial.tsx`'s placement `useLayoutEffect` computed the card's `top`
using `card.offsetHeight` — but the DOM at the moment this effect runs
still carries the *previous* render's `placement.maxHeight` (this effect
is what's about to replace it). `offsetHeight` is capped by whatever
`max-height` happens to still be applied, so after a resize shrinks the
window, the card measured itself against yesterday's ceiling: short
enough that the "does it fit above the spot" check passed, then grew to
its true (taller) height once the new, larger `maxHeight` this effect
itself computed was actually applied a moment later — landing the grown
card on top of the spot the shorter measurement said would clear it.

### Fix

One line: measure `card.scrollHeight` instead of `card.offsetHeight`.
`scrollHeight` reports the content's natural extent independent of
whatever `max-height`/`overflow` is currently constraining the box, so it
gives the same, correct answer whether this is the first placement or the
hundredth — no dependency on which stale style happens to still be
applied. No pixel offsets, no viewport-specific branches, no change to
the anchor/spotlight/scroll-tracking machinery, all of which were already
correct.

### Tests

`npx tsc -b` clean; `npx vitest run` 1044 passed/0 failed. Reproduced the
exact failing scenario (1440×900 → resize to 1000×700 mid-"funding"-step)
before the fix (confirmed overlap via `getBoundingClientRect`) and after
(confirmed `overlap: false`, card and target separated by the intended
~16px gap) — then re-ran `verify-tutorial.mjs` (12/12) and
`verify-browser.mjs` (66/66).

### Regression

The fix touches only the height value fed into an existing formula; the
formula itself, the anchor-selector logic, the scroll/resize/mutation
listeners, and the mobile card-width CSS are all unchanged. Both harnesses
and the manual walk from Phase 5.6 (13 steps, two viewport widths) still
pass with no change in behavior anywhere the bug wasn't present.

### Remaining concerns

- None found. This was the one adversarial scenario (resize mid-anchored-
  step) that the existing test suite didn't already cover; scroll,
  tab-switch, and mobile-width cases were already asserted and remain so.

### Implementation

Added two icons to the existing Finance category (no new category, no new
dependency): `Shield` → **Insurance**, and `BadgeDollarSign` → **Salary**,
both already available in the project's pinned `lucide-react` version.

Separately, opening the icon picker with nothing selected surfaced three
more hardcoded-English strings from the same defect class as Phases 5.3–
5.4 — "No icon" (twice, one as a visible button label, one baked into the
`iconLabel()` fallback that feeds an aria-label) and "Choose icon" (the
picker's placeholder text). Added `icons.noIcon` and `icons.chooseIcon` to
all 5 locales and wired them in.

### Tests

`npx tsc -b` clean; `npx vitest run` 1044 passed/0 failed;
`verify-browser.mjs` 66/66. Manually opened the icon picker on the Netflix
activity: confirmed "Salary" and "Insurance" appear in the Finance group
in the correct position, the picker's clear-icon control now reads
"Aucune icône" instead of "No icon", and the trigger's accessible name
reads "…: Aucune icône" instead of "…: No icon".

### Regression

Pure additions to `ICON_CATEGORIES` plus three text-layer fixes; no
existing icon entry, category, or the resolution/fallback logic was
touched. `ICON_INDEX`'s dedup-by-first-occurrence behavior is unaffected
since both new names are unique.

### Remaining concerns (carried to Phase 5.17)

- **All 251 icon options' `label` and `keywords` are English-only**,
  including the two just added. They are used for the picker's visible
  grid tooltips, screen-reader `aria-label`/`title`, and the search
  match — so a French (or Arabic, German, Spanish) screen-reader user
  hears "Insurance" rather than "Assurance", and typing "assurance" in the
  search box finds nothing. This is the same defect class already found
  in 5.3/5.4/5.5, but translating ~250 labels and their keyword lists
  across 5 locales is a substantial, self-contained localization project,
  not a one-line fix — and Phase 5.17's brief explicitly names "icon
  labels" as one of its accessibility checks, so it is deliberately left
  there rather than folded in piecemeal here.

---

## Phase 5.8 — Airshow / loading transition continuity

**Date:** 2026-09-05
**Environment:** same account, desktop, plus a second pass with Chrome's
CPU (4×) and network (Slow 4G) throttling to force a long display phase,
via chrome-devtools MCP.

### Investigation

The brief describes a specific, concrete defect: "final animation
finishes, aircraft reset, smoke resets, entire animation restarts, then
normal loading animation begins" — i.e. two animations bolted together
with a visible seam between them.

`domain/airshow.ts`'s own header says this bug used to exist and names
five prior versions that had it in one form or another, and the
`CHANGELOG.md` entries for **4.0.0** ("a real 3D loading sequence") and
**4.4.0** ("the aeroplane was not where the arithmetic put it, a
choreographed routine") show it was rebuilt from scratch for exactly this
reason, well before this pass started. The current architecture is one
pure function of elapsed time and a single break-off timestamp
(`sceneAt()`), driving one `requestAnimationFrame` loop with one set of
DOM nodes and one pair of smoke canvases for the whole sequence — display,
join, settle, depart. There is no second animation for it to hand off to:
`Stage` is `"display" | "join" | "settle" | "depart" | "done"`, and `done`
unmounts the overlay directly. So the question was whether that rebuild
actually closed the seam, not which pixel to patch.

### Tests

- `node scripts/verify-airshow.mjs` — the project's own frame-stepped
  harness for this exact question. 387 frames, 0 over 20ms, and the
  decile table shows every escort's position, heading and depth changing
  continuously through `display → join → settle → depart`, no jump.
- `npx vitest run tests/airshow-choreography.test.ts` — 15/15, including
  the assertions that the world-velocity x-component never goes negative
  and no escort teleports at the break-off.
- Live, instrumented, twice: a `MutationObserver`-driven poll logging
  `boot-screen`'s class and every `.boot-escort`'s `transform` at 50ms
  resolution, once on a normal local load and once with Chrome's CPU
  throttled 4× and network capped at Slow 4G (which stretched the display
  phase from ~2.6s to ~14.8s before break-off). In both runs the phase
  sequence was `display → join → settle → depart → gone` with no repeated
  phase, no reset of any escort's transform to its start-of-display value,
  and no gap where `.boot-screen` was absent before the real content
  (`.main-area`) was present. `.panel-loading` (the *actual* other loading
  indicator in the app, used by lazy tab panels) never appeared during
  boot in either run, because the initial tab (`Dashboard`) is imported
  eagerly rather than lazily — so there is no second, unrelated "loading
  animation" for the sequence to hand off to even in principle.
- Screenshots at every decile (`scripts/verify-airshow.mjs`'s output):
  the display's helix, the join's roll-out, the tricolour formation at
  settle, and the departure's stretched ribbons are continuous frame to
  frame with no visible pop.

### Results

🟢 Not reproduced. The literal defect the brief describes — a restart with
a visible reset — does not exist in the current implementation, under
normal or artificially slow loading. This matches the pattern already
seen in this pass (Phase 5.1's stale `KNOWN_ISSUES.md`, Phase 5.2's
already-correct Main Wallet): the brief was written against know-how of
an older failure mode that a prior rebuild (`CHANGELOG.md` 4.0.0/4.4.0,
well before this session) had already structurally eliminated by
replacing two animations with one continuous state function.

### Implementation

None. Verified rather than patched, per the brief's own instruction not
to fix what was not shown to be broken.

### Regression

N/A — no code changed.

### Remaining concerns

- None found for the "restart" defect itself. Phases 5.9 and 5.10 test
  the two things the brief asks for *within* this same continuous
  sequence (a warp effect on departure, cloudier smoke), and are recorded
  separately below since they are separate phases.

---

## Phase 5.9 — High-speed warp acceleration effect

**Date:** 2026-09-05
**Environment:** same account, desktop, chrome-devtools MCP.

### Investigation

The brief asks for a genuinely new visual, not a fix: "directional
streaks, moving lines, depth, motion, acceleration, controlled blur,
environmental speed cues" during the departure, with the sequence reading
as "normal flight → acceleration → high-speed flight → transition."

The departure (`domain/airshow.ts`'s `departure()`) already gives the
*aircraft* that arc — they pull from `CRUISE` (375px/s) to `DEPART_SPEED`
(5600px/s) on a cubic ease, which is why their own smoke stretches into
long ribbons on the way out (§1.23's "the aircraft outran them"). What
does not exist anywhere in `LoadingScreen.tsx` or `styles-extras.css` is
an *environmental* cue — nothing represents the camera's own sense of
speed, only the aircraft's. So this phase is additive: there was no
existing streak effect to find, confirmed by reading both files in full
before writing anything.

### Implementation

Added `.boot-warp`: a layer of 12 thin, feathered horizontal bars
(`WARP_STREAKS` in `LoadingScreen.tsx`, laid out with a deterministic
sine-hash — the same idiom the smoke turbulence already uses — rather than
`Math.random()`, so two loads of the same screen look like the same
effect) that run continuously left to right via one CSS `@keyframes`,
always animating, silent by default.

The "always animating, silent by default" half is deliberate and is the
direct lesson of Phase 5.8: a speed effect that starts and stops on the
`depart` phase class is a second animation handed off to, which is the
exact shape of bug that phase went looking for and didn't find elsewhere.
So instead a single CSS custom property, `--warp-strength`, is written
every frame in the same block that already computes the departure's `t`
and the clip-path reveal (`LoadingScreen.tsx`'s `tick()`), reaching full
strength at 55% of the 900ms departure rather than at 100% — which is
what makes it read as "accelerate, then travel at speed" instead of
"accelerate right up until it stops."

The layer carries no `z-index`: every aircraft and both smoke canvases
already have one (1–4), which is its own stacking level above the
default layer these elements sit in, so the streaks paint underneath
the whole formation by construction rather than by a number chosen to be
smaller than the others. `@media (prefers-reduced-motion: reduce)` hides
the layer outright, matching `.boot-lead-art`'s existing rule in the same
stylesheet — though it is close to redundant: the `reduced` branch in
`LoadingScreen.tsx` never reaches the `depart` stage at all, so
`--warp-strength` never leaves its zero default either way.

### Tests

- `npx tsc -b` — clean.
- `npx vitest run` — 1044 passed / 0 failed (unchanged from Phase 5.7;
  this phase touches no domain logic, only rendering).
- `node scripts/verify-airshow.mjs` — identical choreography output to
  the Phase 5.8 baseline run (same 387 frames, same positions at every
  decile, same "0 over 20ms" frame cost) — confirms the new CSS layer
  costs nothing measurable on the animation's own clock and changes no
  aircraft position.
- Screenshots at 90%, 95% and 100% of the sequence: faint streaks visible
  behind the formation and clipped correctly by the reveal, distinctly
  thinner and dimmer than the smoke ribbons so they read as background
  rather than competing with the aircraft — "do not obscure the aircraft"
  checked by looking, not just by z-index arithmetic.
- Reduced motion: overrode `window.matchMedia` before load so the
  component's own `reduced` branch fires (verified this is the real
  effective gate, since the component reads reduced-motion once via
  `useMemo` at mount, not the live CSS media query) — the sequence skips
  straight to `settle` and finishes on the data with no `depart` stage,
  so `--warp-strength` is never written and the streaks are never
  visible, independent of the CSS media rule.

### Regression

Additive only: one new ref, one new `useEffect`-scoped `style.setProperty`
call inside an existing block, one new CSS block. No existing transform,
z-index, or timing constant was changed. The unchanged
`verify-airshow.mjs` output is the regression check for the choreography
itself.

### Remaining concerns

- The effect was tuned by eye against this one lead aircraft (Concorde,
  200px). It was not re-checked against every aircraft skin in
  `domain/aircraft.ts`; the streaks are laid out independently of the
  lead's own artwork (they don't touch or scale with it) so there is no
  specific reason to expect a difference, but it was not exhaustively
  verified across the fleet.

---

## Phase 5.10 — Cloud-like aircraft smoke

**Date:** 2026-09-05
**Environment:** same account, desktop, screenshots from the Phase 5.8/5.9
`verify-airshow.mjs` runs — same PNGs, read again against this phase's own
checklist rather than re-captured, since nothing about the smoke changed
between them.

### Investigation

The brief's complaint is specific: "The current smoke reads too much like
thin lines... Do not simply make three rigid coloured lines thicker,"
with a checklist — soft volume, billowing, turbulence, density variation,
fading, dispersion, persistence, aircraft-relative emission, correct path
history, and (on a turn) smoke that follows the flight path and does not
rotate like a rigid object.

`components/loading/LoadingScreen.tsx` already implements a full
particle-advection system for the trails, not a drawn line: every frame
each escort emits a `Puff` at its tailpipe, and from then on the puff
belongs to the air (`advect()`) — it drifts, gains turbulence as it ages
(`curl`, scaled from 0 to 1 over its first 0.9s), wanders on two sine
frequencies, and fades to exactly zero opacity by `PUFF_LIFE` (`PLUME()`).
Width grows with the *puff's own age* on a square root curve
(`36 * Math.sqrt(life)`), not linearly, and a per-puff `bulk` term makes
the ribbon's thickness uneven along its own length rather than a uniform
tube. Four passes per ribbon (three widening/fading halos plus a dense
"hot core" over the newest quarter-second) are drawn as one polygon each
through Catmull-Rom-style quadratic midpoints, then the whole canvas gets
a 2px blur. None of this was written for this phase — it is the existing
implementation, and the file's own comments narrate it having already
been rebuilt away from "the brief's... digital bars" and "three perfectly
straight bars" in an earlier pass (matching `CHANGELOG.md`'s 4.2.0 "an
aerobatic routine" and 4.4.0 entries).

### Tests

Read the screenshots from the two prior phases' harness runs against the
brief's own checklist, at deciles spanning the whole sequence rather than
one favorable frame:

- **005pc** (333ms in): even this early, both ribbons are already soft
  and tapered, not a hard line — thin at the tailpipe by design ("thin at
  the nozzle, billowing as it decays" — real jet exhaust does this too),
  not thin throughout.
- **040pc**: full display, mid-manoeuvre — both ribbons show visible
  curvature, soft edges, and uneven width along their length (the `bulk`
  lumps), not a uniform tube.
- **060pc**: the join — the white ribbon curves through the roll-out
  independently of where the aircraft that laid it now is, which is the
  brief's specific "smoke follows the flight path... does not rotate like
  a rigid object" requirement, checked on the one manoeuvre (a roll-out)
  that would expose a rigid-body implementation immediately.
- **090pc**: departure — all three ribbons visibly stretch and thin as
  their aircraft outrun them, which is the brief's "when aircraft
  accelerate, smoke stretches... older smoke disperses" requirement.
- Colour: blue, white, red preserved throughout, white deliberately drawn
  at lower ink (`0.85×`) than blue/red per an existing comment about white
  reading brighter than the other two at equal alpha against the navy sky
  — a density-matching decision already made, not a rigid-line artefact.

### Results

🟢 Not reproduced, on the same evidence pattern as Phase 5.8: the brief's
checklist reads as a description of the smoke system's *design goals*,
and every one of them is independently implemented and visible in the
existing screenshots, including the one case (the join) most likely to
expose a rigid-line shortcut. `CHANGELOG.md`'s 4.2.0–4.4.0 entries and
this file's own header comments (`§1.17`–`§1.22` references) indicate
this was rebuilt from a "three rigid coloured lines" version some time
before this pass, for the reasons the brief now describes.

### Implementation

None. As with Phase 5.8, verified rather than patched.

### Regression

N/A — no code changed.

### Remaining concerns

- None specific to smoke quality. The one open item from this cluster of
  phases is the one already noted in 5.9: the warp streaks were not
  cross-checked against every aircraft skin, which is unrelated to the
  smoke system.

---

## Phase 5.11 — Remember Me authentication

**Date:** 2026-09-05
**Environment:** `server/src/routes/auth.ts` and friends read in full first;
`tests/auth-integration.test.ts` run against a disposable local Postgres
schema (`TEST_DATABASE_URL`); manual pass in Chrome via chrome-devtools
MCP against the project's own local-Postgres dev API, using a fresh
disposable account (`mrintl.rememberme.test@example.com`).

### Investigation

Read the whole authentication stack before changing anything:
`server/src/routes/auth.ts`, `server/src/auth/{cookies,tokens,middleware,
AuthRepository}.ts`, `src/api/auth.ts`, `src/store/authStore.ts`,
`src/components/auth/AuthScreen.tsx`. Findings that shaped the design:

- Sessions are already the right architecture for this — opaque, CSPRNG
  tokens, only a SHA-256 hash stored, revocable by deleting the row,
  `SESSION_TTL_DAYS = 30` — the file's own comment explains this was
  chosen over JWTs specifically because a session must be revocable
  server-side. Nothing about the token scheme needed to change.
- But there is currently no "Remember Me" concept at all: **every**
  sign-in — checked box or not, since there was no box — gets a
  persistent, 30-day cookie. That is the thing this phase has to
  introduce a real distinction into, not merely surface a switch for.
- `AuthRepository.createSession` already takes a `ttlDays` parameter, so
  no schema or repository change was needed — only the route deciding
  which number to pass, and the cookie deciding whether to carry an
  expiry at all.
- `AuthScreen.tsx` had one more hardcoded-English string in the exact
  area being edited: the submit button showed literal `"Working…"` while
  a request was in flight, never routed through `t()`. Fixed alongside
  this phase's own change, same defect class as Phases 5.3–5.5.

Design decision: unchecked is not "the current 30-day behaviour" — it is
a cookie with **no `Max-Age`/`Expires` at all** (gone when the browser
closes), backed by a one-day server-side session as a backstop for a
browser that resurrects closed-session cookies. Checked keeps the
existing, already-tested 30-day persistent behaviour unchanged. This
reads as the industry-standard meaning of the checkbox (Gmail, banking
apps: unchecked = this visit only), and it means signup, password reset,
and change-password/change-email — none of which asked the brief to add
a checkbox — keep exactly the cookie they always have, since
`setSessionCookie`'s new `persistent` option defaults to `true`.

### Implementation

- `server/src/auth/tokens.ts`: added `UNREMEMBERED_SESSION_TTL_DAYS = 1`.
  `SESSION_TTL_DAYS` (30) is unchanged and still used everywhere it was.
- `server/src/auth/cookies.ts`: `setSessionCookie` takes an optional
  `{ persistent?: boolean }`, defaulting to `true`. Only when `false` is
  the `maxAge` field omitted from `res.cookie(...)` entirely — the
  comment in the diff is explicit that a short `maxAge` is not the same
  thing as no `maxAge`, since either one makes the cookie persistent.
- `server/src/routes/auth.ts`: `/signin` reads `rememberMe` from the
  body, treats anything other than `=== true` as unchecked (so an old
  client that sends no field at all fails closed to the short session,
  not open to 30 days), and passes the matching `ttlDays` to
  `createSession` and `{ persistent: remember }` to `setSessionCookie`.
- `src/api/auth.ts` / `src/store/authStore.ts`: `signIn` takes a third,
  optional `rememberMe` argument (default `false`) and threads it to the
  request body.
- `src/components/auth/AuthScreen.tsx`: a checkbox between the password
  field and the submit button, shown only in sign-in mode, plus the
  `"Working…"` → `t("common.working")` fix.
- `src/styles-extras.css`: `.auth-remember`, a plain flex row matching
  the existing `.auth-field` spacing.
- `src/i18n/{en,fr,de,es,ar}.ts`: added `auth.rememberMe` and
  `common.working` to all five locales.

### Tests

- `npx tsc -b` — clean. `npx vitest run` — 1044 passed / 0 failed
  (includes `no-hardcoded-english.test.ts`, which passed with the new
  keys and the `"Working…"` fix in place).
- `tests/auth-integration.test.ts`, extended with five new cases and run
  against a disposable local-Postgres schema (30/30 passed, including the
  25 pre-existing ones — nothing already there broke):
  - unremembered sign-in's cookie carries neither `Max-Age` nor
    `Expires`, and its session row is `~1` day (`EXTRACT(EPOCH FROM
    (expires_at - created_at)) / 86400`);
  - remembered sign-in's cookie carries `Max-Age`, and its row is `~30`
    days;
  - a request with no `rememberMe` field at all gets the short,
    non-persistent cookie — the fail-closed case;
  - sign-out still ends a Remember Me session immediately;
  - an unremembered session is still rejected once its (shorter) server
    row expires, by the same enforcement path `tests/auth-integration
    .test.ts`'s existing "rejects an expired session" case already
    covers for the long session.
- `node scripts/verify-browser.mjs` — 66/66, unaffected (it drives
  sign-up/sign-in but never touches Remember Me).
- Manual, in a real browser, against the project's own local-Postgres dev
  API — this is what actually exercises the React checkbox rather than
  the API directly: signed up a fresh disposable account, then signed in
  twice, once with the box unchecked and once checked, reading the raw
  `Set-Cookie` header via the DevTools Network panel both times.
  Unchecked: `budget_session=…; Path=/; HttpOnly; SameSite=Lax` — no
  expiry attribute of any kind. Checked:
  `budget_session=…; Max-Age=2592000; Path=/; Expires=Mon, 05 Oct 2026
  …; HttpOnly; SameSite=Lax`. Reloaded after the remembered sign-in and
  stayed signed in, confirming the persistent cookie actually survives a
  refresh and not merely that the header looked right.

### Regression

None to existing behaviour: every call site other than `/signin`
(`signup`, `reset-password`, `change-password`, `change-email`) calls
`setSessionCookie` with no third argument, so `persistent` defaults to
`true` and those flows are byte-for-byte what they were. The 25
pre-existing cases in `tests/auth-integration.test.ts` all still pass.

One process-level hazard surfaced while testing this phase, worth
recording since it nearly produced a false result: the project's
local-Postgres API server (`scripts/dev-server-local-pg.mjs`, launched
via plain `tsx`, not `tsx watch`) had been running continuously since
before this session started and does **not** reload on source changes —
the first manual browser test showed a 30-day cookie for an unchecked
box, which was the *old* code still running, not a bug in the new code.
Restarting the process (and pointing it at the session's actual working
database, `budget_mrintl_2026`, confirmed by checking which local
database actually held `mrinternational.test@example.com`) resolved it.
Recorded as its own memory (`dev-server-does-not-hot-reload`) so a future
session does not lose time to the same thing.

### Remaining concerns

- Signup does not accept a `rememberMe` flag and always keeps the
  existing persistent 30-day cookie, on the basis that the brief's own
  test list ("login, checkbox off, checkbox on, refresh...") is about the
  *sign-in* flow specifically, and immediately signing a brand-new
  account out after registering would be a strange first impression. If
  a genuinely-unremembered signup is wanted later, the same `{ persistent
  }` plumbing already supports it.
- "Close and reopen the browser" was verified by the mechanism that
  governs it (the cookie's own `Max-Age`/`Expires` attributes, read
  directly off the wire) rather than by literally quitting and relaunching
  Chrome, which chrome-devtools MCP has no primitive for.

---

## Phase 5.12 — Username authentication

**Date:** 2026-09-05
**Environment:** `server/src/auth/*` and `server/src/migrations/index.ts`
read in full first; `tests/auth-integration.test.ts` extended and run
against a disposable local Postgres schema; manual pass in Chrome via
chrome-devtools MCP against the project's own local-Postgres dev API
(restarted first — see [[dev-server-does-not-hot-reload]]), using the same
disposable account this pass created for Phase 5.11.

### Investigation

No username infrastructure existed anywhere — not in the schema, not in
`AuthRepository`, not in any route. The brief's "if it does not exist, add
it coherently" applied in full, so the design questions (character set,
length, normalization, uniqueness) were this phase's real content rather
than a formality:

- **Uniqueness collisions.** Mirrored `email`/`email_normalized` exactly:
  a raw column for display and a case-folded column carrying the actual
  `UNIQUE` constraint, so "Alice" and "alice" cannot become two different
  handles — the same reasoning `normalizeEmail`'s own comment already
  gives for addresses.
- **Character set and length.** Deliberately narrower than email's own
  `isPlausibleEmail` (which is permissive because mail delivery is the
  real test): a username is chosen, not verified externally, so the shape
  itself has to rule out confusion. `^[a-z][a-z0-9_-]{2,23}$` — 3–24
  characters, starts with a letter, and **excludes `@`** specifically
  because that is what lets sign-in tell a username from an email without
  a database round trip (see below).
- **"Keep email login."** Read literally: a second *field* for username
  would make sign-in a choice ("which one is this?"), not an addition.
  Instead the existing identifier field accepts either, and
  `AuthRepository.findUserByIdentifier` decides which column to query by
  whether the string contains `@` — reliable in both directions, since
  every plausible email requires one and the character set forbids it in
  every valid username.
- **"Authentication errors should not unnecessarily reveal account
  existence."** Already true for email (identical status/body for unknown
  address vs. wrong password) and unaffected by construction: an unknown
  *username* now takes the same code path as an unknown *email* through
  the same `findUserByIdentifier` → null → same 401.
- Scope boundary: the brief's explicit list for this phase is "login UI
  ... account settings" — not signup UI. So `/signup` is untouched and a
  username is only ever acquired afterward, through Account Settings. That
  sidesteps a question sign-up would otherwise raise (does a username
  collision at signup get its own error code alongside `email_taken`?)
  without dropping any requirement the brief actually stated.

### Implementation

- `server/src/migrations/index.ts`: migration `016-username-authentication`
  — `users.username` (display form) and `users.username_normalized TEXT
  UNIQUE` (nullable; a `UNIQUE` column permits any number of `NULL`s, so
  every existing account is valid with no backfill).
- `server/src/auth/AuthRepository.ts`: `normalizeUsername`,
  `isValidUsername` (the pattern above), `findUserByIdentifier` (the `@`
  branch), `setUsername` (unique-violation → `false`, the same
  detect-by-consequence pattern `createUser`/`updateEmail` already use).
  `UserRecord`, `SessionRecord`, and every `SELECT` that builds one now
  carry `username`.
- `server/src/auth/middleware.ts`: `AuthContext` gains `username`, read
  once per request from the same session join that already reads `email`
  — no extra query.
- `server/src/routes/auth.ts`: `/signin`'s `email` field is now
  documented as "really identifier" and resolved through
  `findUserByIdentifier`; its rate-limit bucket renamed from
  `signin:email:` to `signin:id:` to match. New `POST /api/auth/set-username`
  behind `requireAuth` only — **not** behind the current password like
  change-email/change-password, because a username is a second way to
  sign in, not a channel anything gets recovered through, so choosing one
  from an unattended session cannot hand the account to anyone who does
  not already have the password. `publicUser()` and `/me` now include
  `username`.
- `src/api/auth.ts`, `src/store/authStore.ts`: `AuthUser.username`,
  `setUsername()`, two new `ERROR_KEYS` entries.
- `src/components/auth/AuthScreen.tsx`: the sign-in identifier field is
  `type="text"`/`autoComplete="username"` with a relabelled "Email or
  username" — only in sign-in mode; sign-up and password reset still
  require a real address and keep `type="email"`. (An `email` input
  enforces the browser's own format constraint on submit, which would
  make a bare username unsubmittable — this is not cosmetic.)
- `src/components/settings/AccountSettings.tsx`: a third mode alongside
  email/password, showing the current username (or "Not set") and a
  set/change form with no current-password field, matching the
  password-not-required design above.
- Five locales: `auth.emailOrUsername(Placeholder)`, `auth.error
  .invalidUsername`/`usernameTaken`, seven `account.*` strings, and
  `auth.error.invalidCredentials`'s existing text updated in all five to
  mention username alongside email/password.

### Tests

- `npx tsc -b` clean; `npx vitest run` 1044 passed / 0 failed.
- `tests/auth-integration.test.ts`, extended with 8 new cases (38/38
  total, all pre-existing ones still passing). Placed **before** the
  file's existing "throttles repeated failed sign-ins" test deliberately
  — that test drives the shared per-IP rate-limit bucket past its cap and
  never resets it, so anything added after it inherits a 429 unrelated to
  its own assertions. Found this the hard way: the first run of these
  tests failed with 401s/429s that had nothing to do with username logic,
  traced to (a) an email address that collided with an earlier test's
  fixture and (b) the rate-limit ordering, both fixed before the suite
  was trusted. New cases: no username until one is set; setting one and
  signing in with it (case-insensitively, like email); still signing in
  by the original email afterward; a case-insensitive collision rejected
  with `username_taken` *without* touching the original holder's account;
  every invalid shape (`ab`, `1abc`, `has space`, `has@sign`,
  `-leadinghyphen`, 25 characters) rejected with `invalid_username`
  before touching the database; identical error for an unknown username
  vs. a wrong password; a username change succeeding with no
  `currentPassword` field sent at all; `set-username` refused with no
  session.
- `node scripts/verify-browser.mjs` — 66/66 after one fix: the harness's
  "a failed sign-in is reported in the reader's language" check selected
  `input[type=email]` on the sign-in screen, which this phase's own
  change to `type="text"` broke. Reselected on `input[autocomplete
  =username]`, which is stable across both input types. `node
  scripts/verify-tutorial.mjs` — 12/12, unaffected.
- Manual, in a real browser: set a username ("mrintl_flyer") on the
  disposable account from Phase 5.11 through the new Account Settings
  form — button disabled until the pattern matched, success message on
  save, and the display line updated live. Signed out, then signed back
  in typing **only the username** (no `@`, nothing email-shaped) — landed
  back on the same account. This is what actually exercises the relabelled
  field and the `@`-based routing rather than the API directly.

### Regression

- Rediscovered [[dev-server-does-not-hot-reload]] applies to every backend
  phase, not just 5.11 — restarted the local-pg dev server before trusting
  any of this phase's manual browser testing.
- `/change-email`'s response previously hand-built
  `{ id, email }` rather than going through `publicUser()`, which would
  have silently dropped `username` from the response on every email
  change once one existed. Fixed as part of wiring `publicUser()` through
  consistently — a genuine latent bug this phase's own addition would
  otherwise have introduced.
- No existing call site of `setSessionCookie`, `createUser`, or
  `findUserByEmail` changed shape; all three are still called exactly as
  they were everywhere except `/signin`.

### Remaining concerns

- Usernames cannot be chosen at signup, only afterward in Account
  Settings — a deliberate scope boundary (see Investigation), not an
  oversight, but worth naming if a future phase wants it.
- `isValidUsername`'s pattern is enforced both client-side (a mirrored
  regex in `AccountSettings.tsx`, for instant feedback) and server-side
  (authoritative). The two are currently kept in sync by hand rather than
  imported from one place, since the client bundle has no access to
  `server/src`; a drift between them would produce a confusing "the form
  said this was fine but the server rejected it" rather than a security
  issue, since the server always re-checks.
