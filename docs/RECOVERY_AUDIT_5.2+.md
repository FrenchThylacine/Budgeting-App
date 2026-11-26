# v5.2+ recovery audit

Reviewed from Git history and current behavior at `5.4.1` plus the unversioned
2026-11-25 loan/accounting commit. Follow-up verification and fixes are now at
`5.4.4`. No semantic release tags exist; changelog and
package metadata were the version records. Existing claims were treated as
unverified until checked in code or tests.

| Requirement | Status | Evidence / remaining limit |
| --- | --- | --- |
| 2 Audit v5.2+ history, changelog and current implementation | Correct and verified | Inspected commits from 5.2.0 through 5.4.1 and HEAD; prior release claims were checked against code/tests. |
| 3.1 Loan edit/delete and linked balance/history integrity | Correct and verified | Store test edits direction, currency and year after repayment, then deletes linked entries. |
| 3.2 Cash balance plus net loan position | Correct and verified | Wallet retains cash balance, shows net receivable/payable and cash-plus-loans figure. |
| 3.3 Loan source/destination and intermediary movements | Incomplete | Budget, Personal and Person endpoints are recorded; no separate account ledger exists in the current model. |
| 4 Historical monthly allocations in Analytics | Correct and verified | Historical allocation selector and pacing regression; missing historical allocation stays unavailable. |
| 5 Smart projections | Correct and verified | Future-dated personal purchases, scheduled activity charges, elapsed days and prior-year sample feed the chart projection; 3 focused suites pass. |
| 6 Wallet History activity categories | Correct and verified | Spending, ordinary ledger entries, linked loan movements and direct adjustments are separate groups; loan rows cannot be independently edited. |
| 7 Edit past-month allocations in Wallet | Incomplete | Wallet has an in-place month editor and preserves other months; direct interaction could not be verified in a browser. |
| 8 Remaining amount percentage and tones | Correct and verified | Percentage uses selected allocation; zero/unavailable budget suppresses division and negative values are red. |
| 9 Carry-over and reset behavior | Correct and verified | Ledger derives carry-in and reset close status; wallet reset regression suite passed in full run. |
| 10 Monthly Analytics bar colors | Incomplete | Source uses per-month allocations and applies current/historical tints; visual states lack a rendered-browser check. |
| 11 Combined date and time control | Incomplete | Shared editor has local date and clock controls and stores one timestamp; user interaction was not browser-tested. |
| 12 Transaction form density and responsive layout | Incomplete | Shared editor structure reviewed and production build passed; responsive interaction lacks browser verification. |
| 13 Report redesign and opening | Incomplete | Responsive report HTML and panel/tab actions are covered by report tests; live opening was not verified because no database configuration or browser executable is available. |
| 14 Local website/browser bug hunt | Incomplete | `.env` and `TEST_DATABASE_URL` are absent; the installed CDP harness has no supported Chrome executable path on this Windows host, so no browser session was run. |
| 15 Tests and regression prevention | Incomplete | Build passes. Full test run: 1,042 passed, 4 unrelated baseline copy/vocabulary checks failed, 84 skipped. Targeted finance/report/i18n suites: 176 passed. |
| 16 Documentation and changelog | Correct and verified | README, testing guide, recovery checklist and 5.4.2 changelog updated. |
| 17 Token-efficient execution and persistent checklist | Correct and verified | Targeted audit, concise progress updates and this persistent recovery checklist. |
| 18 Re-audit existing implementation | Correct and verified | Current implementation and history were inspected; found and fixed historical budget, future transaction and loan-history defects. |
| 19 Semantic versioning | Correct and verified | Patch release `5.4.2`; package and lockfile aligned. |
| 20 Final completion requirements | Incomplete | Most finance requirements are implemented; intermediary accounts and browser-only verification remain incomplete. |
| Database migration | Not applicable | Required loan link fields (`loan_id`, `loan_movement`, `loan_budget_effect`) already exist and round-trip in the existing schema. |

## Verified commands

- `npm.cmd run build` — passed.
- Focused Analytics, projection, activity-budget, loan, report and translation
  suites — 212 tests passed.
- Full `npm.cmd test` — 1,046 passed, 4 failed, 84 skipped. Remaining failures:
  the broad English-prose scanner and three visual-vocabulary tests; none
  concern the changed finance paths.
- Browser/localhost workflow — not run; prerequisites above were unavailable.

## 5.4.4 Historical budget and Analytics completion checklist

- [x] Separate historical allocations; unlocked edit preserves other months and Analytics reads the edited amount.
- [x] Carry positive/negative values normally; reset after positive or negative balance, including an empty month.
- [x] Remaining percentages handle positive, negative, exact-zero and zero-allocation states.
- [x] Historical bar colors and all current-month status overlays covered by focused style tests.
- [x] README, architecture, database, testing guide and changelog reviewed and updated; no schema change.
- [x] Focused suites: 170 passed; production build passed.
- [ ] Live Wallet/Analytics browser inspection remains; `.env` and database URL are absent, so the authenticated app cannot be run against persisted data here.

## 5.4.3 Wallet hotfix

Active loan receivables/payables now appear beside actual Wallet cash in a
same-sized total. Repaid cash is not counted a second time as an active loan;
converted loans no longer affect the active tally. Budget-side loans feed the
budget figure, and personal is derived as the remainder, so both reconcile to
the loan-adjusted total. Both headline totals use the configured secondary
currency equivalent. The transaction date, time and timestamp toggle now share
one full-width row. Focused suites passed 97/97 after these changes; the full
suite passed 1,046 tests, with 4 existing copy/vocabulary failures and 84
skipped. Production build passed. Browser interaction could not be checked
because this environment has no configured database or installed browser.
