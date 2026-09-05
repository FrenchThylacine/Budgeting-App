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
