# v5.2+ recovery audit

Reviewed from Git history and current behavior at `5.4.1` plus the unversioned
2026-11-25 loan/accounting commit. Follow-up verification and fixes are now at
`5.5.0`. No semantic release tags exist; changelog and
package metadata were the version records. Existing claims were treated as
unverified until checked in code or tests.

| Requirement | Status | Evidence / remaining limit |
| --- | --- | --- |
| 2 Audit v5.2+ history, changelog and current implementation | Correct and verified | Inspected commits from 5.2.0 through 5.4.1 and HEAD; prior release claims were checked against code/tests. |
| 3.1 Loan edit/delete and linked balance/history integrity | Correct and verified | Store test edits direction, currency and year after repayment, then deletes linked entries. |
| 3.2 Cash balance plus net loan position | Correct and verified | Wallet retains cash balance, shows net receivable/payable and cash-plus-loans figure. |
| 3.3 Loan source/destination and intermediary movements | Incomplete | Budget, Personal and Person endpoints are recorded; no separate account ledger exists in the current model. |
| 4 Historical monthly allocations in Analytics | Correct and verified | Historical allocation selector and pacing regression; missing historical allocation stays unavailable. |
| 5 Smart projections | Correct and verified | Future-dated personal purchases, scheduled activity charges, elapsed days and prior-year sample feed the chart projection; `projection.test.ts` passed in the focused release run. |
| 6 Wallet History activity categories | Correct and verified | Spending, ordinary ledger entries, linked loan movements and direct adjustments are separate groups; loan rows cannot be independently edited. |
| 7 Edit past-month allocations in Wallet | Implemented; browser check pending | 5.5.0 month editor can add or change an allocation and set carried-in funds; focused store regression confirms downstream carry recomputes without changing cash. |
| 8 Remaining amount percentage and tones | Correct and verified | Percentage uses selected allocation; zero/unavailable budget suppresses division and negative values are red. |
| 9 Carry-over and reset behavior | Correct and verified | Ledger derives carry-in and reset close status; wallet treasury and reset suites passed in the focused release run. |
| 10 Monthly Analytics bar and graph colors | Correct and verified | In 5.5.0, explicit bar year/month metadata selects each ledger allocation, independent of order; missing historical allocations can be added in Wallet instead of being compared against a guessed budget. |
| 11 Combined date and time control | Incomplete | Shared editor has local date and clock controls and stores one timestamp; user interaction was not browser-tested. |
| 12 Transaction form density and responsive layout | Incomplete | Shared editor structure reviewed and production build passed; responsive interaction lacks browser verification. |
| 13 Report redesign and opening | Incomplete | Responsive report HTML and panel/tab actions are covered by report tests; report opening was not part of the 5.4.6 browser inspection. |
| 14 Local website/browser bug hunt | Partially verified | Home and Analytics/Stats were inspected in local desktop/mobile Chromium with deterministic API fixtures; persisted database workflows remain unverified because `.env` and `TEST_DATABASE_URL` are absent. |
| 15 Tests and regression prevention | Verified for focused release checks | 175 focused wallet, chart, selector, projection and i18n tests passed; after the final carry-in/reset adjustment, the 99-test wallet/chart subset passed again. Frontend and backend builds passed. Full suite and browser interaction were not verified. |
| 16 Documentation and changelog | Correct and verified | README, architecture, database notes, testing guide, recovery checklist and 5.5.0 changelog reviewed and reread. |
| 17 Token-efficient execution and persistent checklist | Correct and verified | Targeted audit, concise progress updates and this persistent recovery checklist. |
| 18 Re-audit existing implementation | Correct and verified | Current implementation and history were inspected; found and fixed historical budget, future transaction and loan-history defects. |
| 19 Semantic versioning | Correct and verified | Minor release `5.5.0`, following Git HEAD `5.4.7`; package and lockfile aligned. |
| 20 Final completion requirements | Incomplete | Chart and editor changes are in 5.5.0; intermediary accounts and database-backed browser verification remain incomplete. |
| Database migration | Not applicable | Required loan link fields (`loan_id`, `loan_movement`, `loan_budget_effect`) already exist and round-trip in the existing schema. |

## 5.5.0 historical month editing checklist

- [x] A spending month without an allocation remains neutral and can now be opened in Wallet to set its actual allocation and carry-in.
- [x] Carry-in is stored as a signed budget-only entry; updating it leaves wallet cash unchanged and recalculates later monthly balances.
- [x] Focused wallet, analytics chart, selector, projection and i18n tests: 175 passed; final wallet/chart subset: 99 passed. Frontend and backend builds passed; browser interaction is pending.
- [x] README, changelog, architecture, database and testing notes updated; no schema migration.

## 5.4.7 monthly chart alignment and forecast checklist

- [x] Monthly budget status joins each value to its explicit year/month, not its array index; a reordered-bar regression covers distinct allocations, exact/above/below status, EUR-to-USD normalization and a missing historical allocation.
- [x] Home, Stats and Analytics monthly bars and trend markers use the shared status calculation; current month remains orange with status overlay and hatch.
- [x] Actual cumulative forecast remains a solid, unfilled line; projection starts at the actual endpoint as a dashed line; budget remains a separate dashed reference.
- [x] Browser fixture checked Home, Stats and Analytics at desktop/mobile sizes, with historical and current below/exact/above cases; no page errors or mobile horizontal overflow.
- [x] Focused suite: 133 passed. Frontend production build and backend TypeScript build passed. Full suite and database-backed browser flows were not run.
- [x] README, CHANGELOG, architecture, database notes, testing guide and this checklist reread; no schema change.

## 5.4.6 verification

- `npm.cmd test -- --reporter=dot --silent=true tests/wallet-treasury.test.ts tests/wallet-reset.test.ts tests/analytics-selectors.test.ts tests/analytics-charts.test.ts tests/analytics-budget-bars.test.ts tests/projection.test.ts tests/i18n.test.ts` — 180 tests passed.
- `npm.cmd run build` and `npm.cmd run server:build` — passed.
- Local desktop and mobile Chromium — Home and Stats/Analytics checked with deterministic snapshot fixtures. Historical below/exact/above and current below/exact/above states rendered with the expected colors, markers and hatching; no page errors or mobile horizontal overflow.
- Database-backed browser and integration runs were unavailable because `.env`, `DATABASE_URL` and `TEST_DATABASE_URL` are absent.

## 5.4.6 Historical budget and chart consistency checklist

- [x] Separate historical allocations; unlocked edit preserves other months and Analytics reads the edited amount.
- [x] Carry positive/negative values normally; reset after positive or negative balance, including an empty month.
- [x] Remaining percentages handle positive, negative, exact-zero and zero-allocation states.
- [x] Historical exact bars are green with gold markers; current bars are orange with status overlays and stronger hatching; Home and Analytics share status logic.
- [x] README, architecture, database, testing guide and changelog reviewed and updated; no schema change.
- [x] Focused suites: 180 passed; frontend production build and backend TypeScript build passed.
- [x] Home and Analytics/Stats inspected in local desktop and mobile browsers with deterministic mocked authentication and snapshot data. No `.env` or database URL is present, so persisted database integration was not exercised.

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
