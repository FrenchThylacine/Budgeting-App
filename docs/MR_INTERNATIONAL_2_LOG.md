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
   **Personal Balance** (€40→€15), not Remaining Budget (stayed €75,00) —
   and the "Budget par mois" table's September row was left stale,
   unchanged by the new ledger entry. Also assigned to Phase 5.2.
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
