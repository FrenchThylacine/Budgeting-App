# Engineering decisions

This file records decisions that affect future changes to the Budgeting App.

## 2026-08-10 — One Express app for local and Vercel execution

**Decision:** Keep Express as the REST API and separate application construction from process startup.

**Implementation:** `server/src/app.ts` exports the shared application. `server/src/index.ts` only starts the local listener, while `api/index.ts` exports the same application for Vercel Functions. (The file was `api/[...path].ts` when this was written; see the 2026-08-16 routing fix in `README.md` for why the catch-all had to go.)

**Why:** This avoids separate route implementations for development and deployment, and prevents a Vercel import from opening a long-lived local listener.

**Status:** TypeScript builds pass. A Vercel preview remains required to verify platform routing and environment configuration.

## 2026-08-10 — Explicit persisted theme selection

**Decision:** Theme is controlled by the existing persisted `settings.darkMode` setting rather than system-preference detection.

**Implementation:** The React application synchronizes the setting to `html.dark` and `color-scheme`.

**Why:** The user has made an explicit application-level choice. Scoping tokens to the root ensures page-level colors, native form controls, dialogs, and mobile navigation receive the same palette.

**Status:** Builds pass; browser light/dark verification remains open.

## 2026-08-10 — Separate calendar and ISO week years

**Decision:** Keep the existing calendar `selectedYear` for monthly/yearly records and persist a separate `selectedWeekYear` for ISO-week navigation.

**Implementation:** `src/domain/periods.ts` centralizes period labels, mode transitions, navigation, and historical comparisons. The header, application shell, spending view, and analytics all use this model. Switching from a week to a month anchors to the ISO week's Thursday, which belongs to the ISO week-year and gives a predictable month at year boundaries.

**Why:** An ISO week can span two calendar years. Reusing the calendar record year made week 1/week 53 navigation, historical detection, and analytics filtering ambiguous and could hide December or January entries.

**Status:** Automated ISO-boundary regression tests and both TypeScript builds pass. Browser verification remains open.

## 2026-08-21 — Who paid is a rule, not a setting

**Decision:** Externally funded spending is excluded from every personal-budget figure, unconditionally. There is no preference.

**Implementation:** `src/domain/funding.ts` — a leaf module importing nothing — holds the predicate. `calculations.ts`, `analytics.ts` and `report.ts` all filter through `personalEntries(...)`. `settings.ignoreNonBudgetSpending` is marked deprecated in the type so old snapshots round-trip, and is read by nothing.

**Why:** It was a checkbox, off by default. That meant the app's default behaviour charged the user for money somebody else had spent: a €200 dinner a friend paid for made a €1,000 budget report €500 remaining instead of €700, and the burn rate, forecast, caps and health score were all wrong by the same amount. Worse, the check was duplicated — `calculateYear` did not apply it to `totalSpend` or `ytdTotal` at all, so those two figures disagreed with every other figure in the app.

Whether €200 someone else spent counts as your spending is not a matter of taste. Making it configurable meant shipping a wrong answer as the default and calling it a preference.

**Consequence for future work:** any new figure that sums spending must consciously pick `personalEntries(entries)` or the unfiltered ledger, and if it picks the ledger its label must say so. There is no third option and no setting to consult.

**Status:** 19 tests built on the specification's worked example; browser-verified end to end against real PostgreSQL.

## 2026-08-21 — One editor shell, and an effect that depends on nothing

**Decision:** Every editor in the application uses `EditorSheet`, and its set-up effect has an empty dependency array with `onClose` read through a ref.

**Why:** The effect previously listed `onClose`. Every caller passes a fresh closure — an inline arrow, or a handler redefined on each render — and the draft lives in the parent's state, so the effect tore down and re-ran **on every keystroke**. Its first act is to focus the sheet's first field. Typing the second character of a name put the caret back at the start; typing into any later field threw focus to the first.

The tempting fixes are all wrong: a `setTimeout` before focusing, a saved `selectionStart` restored afterwards, a `useCallback` on every caller. The first two are hacks that fight the symptom; the third is a rule every future caller must remember, and the failure when they forget is silent. Making the effect genuinely mount-only fixes it once, for every editor that exists and every one that will.

**Consequence:** if you add an effect to `EditorSheet`, think very hard before giving it a dependency. Scenarios shipped its own modal with its own copy of this bug; it now uses the shell.

**Status:** `tests/editor-typing.test.tsx` fails against the previous code and passes against this one. Confirmed in a real browser with a 32-character name typed one key at a time.

## 2026-08-21 — Colours that are text are not the colours that are fills

**Decision:** `--success`, `--warning`, `--danger` and `--purple` keep their saturated values for fills, and gain `-text` variants for anywhere the colour *is* the text.

**Why:** A single semantic colour cannot satisfy both jobs. `--warning` at 2.5:1 is right for a chart series and a badge tint, where contrast is read against the shape beside it; as 13px text it is illegible. Darkening the shared token would have muddied every chart and progress bar to fix a text problem.

**Status:** A scripted sweep over every text node on ten tabs in both themes reports zero WCAG AA failures. Re-run it after any palette change — the value that failed got in by being eyeballed.

## Open decision — Snapshot write model

The current nested-record delete-and-reinsert persistence strategy has not been accepted as a long-term architecture. Replace it with targeted transactional writes only after a Neon-backed behavior audit and migration plan are in place; do not make an unverified rewrite.
