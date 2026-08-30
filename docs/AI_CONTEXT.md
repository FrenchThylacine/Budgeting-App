# AI_CONTEXT.md

> This document gives AI assistants (Codex, Claude, ChatGPT, Gemini, Kimi, etc.) the necessary context before modifying the project.

---

# Project Summary

This project is called **Budgeting App**.

Although it started as a budgeting dashboard, its objective has evolved into becoming a **complete personal finance platform**.

The application is designed to remain modular, scalable and maintainable so that new financial modules can be added over time without requiring a complete rewrite.

The goal is **not** to create another spreadsheet-like budgeting application.

The goal is to create a product that feels comparable to modern fintech software while remaining easy to use every day.

---

# Current Technology

Frontend

- React
- TypeScript
- Vite

Backend

- Express

Database

- Neon PostgreSQL

Deployment

- Vercel

Source Control

- GitHub

---

# Current State

The project is actively developed.

Many systems are already implemented.

These systems should be understood before making modifications.

Examples include:

• Budget management

• Historical snapshots

• Budget approvals

• Recurring expenses

• Currency conversion

• Categories

• Activity log

• Analytics

• Dashboard

• Settings

• Transactions

The architecture already exists.

Future work should improve it rather than replacing it.

## Where to look first (2026-08-22)

If you are changing something in this project, these are the files whose comments will save you the most time — each documents a defect that was expensive to find:

| File | What it protects |
| --- | --- |
| `src/domain/funding.ts` | Rule 7 above. One predicate, no setting |
| `src/domain/payments.ts` | That when money leaves is not what something costs per month. Two sessions a week is not two payments a week; €60 a year is not €60 a month |
| `src/components/ui/EditorSheet.tsx` | Why its set-up effect depends on nothing. A dependency there was the "typing is unusable" bug, in every editor |
| `src/components/ui/EntityMark.tsx` | One mark resolver for wishlist items *and* activities, with a fallback at every network-fetched layer — and why it reports the layer it rendered rather than the one requested |
| `server/src/repositories/SnapshotRepository.ts` | A fixed column list: a field added to the model but not to the schema, the upsert *and* the parser is silently dropped on the next round trip |
| `server/src/db/schema.ts` | Why it may never reference a column a migration adds |
| `src/domain/dashboard.ts` | How a stored arrangement from an older version is reconciled |
| `src/components/ui/SwipeRow.tsx` | Why gesture state lives in refs and not in state |
| `src/styles.css`, the historical-period block | Why the fix for "the banner eats clicks" was *removing* a `z-index`, not adding one |

### Three rules this project keeps learning the hard way

1. **A date nobody entered is not a date.** Where a schedule cannot be derived, the app says so and shows the figure it does know. It never invents 1 January, or today plus 365 days, to have something to put on a calendar.
2. **A rule with one definition cannot be honoured by one view and ignored by another.** `funding.ts`, `schedule.ts`, `payments.ts` and `dashboard.ts` import nothing from the rest of the domain, and that is the point. A second implementation for a second surface is how every drift in this codebase started.
3. **Measure it; do not look at it.** The grey ramp, the icon sizes, the click priority and the animation direction were all verified by script — and the two contrast defects found this pass had survived a previous sweep that *looked* thorough but read `background-color` and could not see a gradient. When a check reports success, ask what it would have to be blind to for that to be wrong.

## Implementation status (2026-08-15)

The React client provides the core budgeting workflows: transactions, recurring activities, categories, wallet, wishlist, scenarios, settings, analytics, and historical summaries. Period state is shared — month/year selections use calendar years while week selections retain an explicit ISO week-year, so cross-year weeks are not lost. The shell derives historical state once and applies it across period-aware views; store guards block period-bound mutations in historical periods.

**All financial figures come from `src/domain/analytics.ts`.** The Dashboard and the Analytics page are presentation layers over that one module. Do not compute a financial figure inside a component, and do not add a second implementation for a surface — that is exactly how the Dashboard previously drifted into ignoring the global period selector.

Persistence has been verified against a live PostgreSQL database and from a real browser, including refresh durability, server-restart durability, and a two-device read/write/conflict cycle. `snapshots.revision` provides optimistic concurrency: a stale write is rejected with 409 and the client adopts the server snapshot rather than overwriting newer data.

Four things future agents should know before assuming otherwise:

- **Mocked-driver tests are not sufficient for persistence.** Five SQL-level defects passed a mocked `sql` tag and failed against real PostgreSQL. Run `npm run test:db` with `TEST_DATABASE_URL` set.
- **A passing `server:build` does not mean the server runs.** It only means `tsc` emitted files; the output was previously unable to start at all. Boot it.
- **Adding a field to a TypeScript model does not persist it.** `SnapshotRepository` writes a fixed column list, so a new field is silently dropped on the next round-trip unless you also touch `schema.ts`, a migration, the upsert, and the parser. Add a round-trip test.
- **Never let an API failure look like a success.** The store deliberately reports `offline` rather than falling through to IndexedDB silently. That silent fallback is what made two browsers each appear to work while holding different data.

Charts live in `src/components/charts/` and are dependency-free SVG. Axis ticks come from `niceTicks` — never hardcode an interval. Missing periods must render as gaps or `?`, never as zero.

Consult `implementation_plan.md` for live, verified status rather than treating this document as a release checklist.

---

# Product Vision

The application should eventually become a complete financial management platform.

Possible future modules include:

Savings

Investments

Accounts

Shared budgets

Cloud synchronization

Authentication

Notifications

AI financial assistant

Receipt OCR

Budget goals

Financial reports

Subscription tracking

Expense prediction

Because of this, all code should be written with scalability in mind.

---

# Current Design Philosophy

The interface should feel:

Minimal

Elegant

Professional

Premium

Fast

Calm

Trustworthy

The application should never feel like an admin dashboard.

It should never feel like a spreadsheet.

Instead it should resemble products like:

• Apple Wallet

• Apple Health

• Copilot Money

• Monarch Money

• Revolut

• Linear

• Arc Browser

without copying them.

---

# Core Financial Rules

These rules are critical.

Breaking any of them introduces financial bugs.

Rule 1

0 is a valid user value.

Never interpret 0 as missing.

---

Rule 2

Missing historical information is represented using:

NaN

undefined

null

or missing values.

Never automatically convert missing values into zero.

---

Rule 3

Historical data is immutable.

Never modify historical months automatically.

---

Rule 4

Recurring expenses must remain mathematically correct.

---

Rule 5

Currency conversion must never modify stored values.

Convert only for presentation.

---

Rule 6

Budget calculations are more important than visual appearance.

Correctness always has priority.

---

Rule 7

Money somebody else paid is not money this budget spent.

A transaction whose source is `external` or `shared` — anything other than `personal` — keeps its full amount and stays visible in the ledger, and is excluded from **every** figure that answers "how am I doing against my budget": remaining, utilisation, burn rate, forecast, category totals and caps, health, period comparisons, the year and year-to-date totals, and the reports.

Budget €1,000, personal €300, external €200 leaves **€700**.

This is not configurable. It lives in `src/domain/funding.ts`, and every budget selector filters through `personalEntries(...)`. If you are writing a figure that sums spending, you must consciously choose one of:

- `personalEntries(entries)` — a budget figure. Almost always this one.
- the entries unfiltered — the full ledger, and the label must say so ("All transactions").

There was a setting for this once (`ignoreNonBudgetSpending`, default *off*), which meant the app's default behaviour charged the user for money they had not spent. The field is still declared in `Settings` as deprecated so old snapshots round-trip, and nothing reads it. Do not read it.

---

# No category is special

**This supersedes the "Piloting Category" rule in `CODEX_MASTER_GUIDE.md`**, at the
owner's explicit direction: *"Do not create special logic for piloting.
Piloting is simply another activity which can be paid by me, someone else or
outside the budget."*

For a period, that rule was implemented. `piloting` was a value of
`BudgetCategory.bucket`, and it carried powers no other category had:

- `calculateYear` reported a separate `pilotingBudget`, and
  `settings.pilotIncludedInBudget` decided whether it joined the total;
- `summarizeMonth` split every period into `generalTotal` and `pilotingTotal`;
- `categoryBreakdown` subtracted it from the denominator and gave it a `null`
  share, which is the only reason the category shares needed a footnote
  explaining why they did not add up to 100%;
- `monthlyBudgetPlan` excluded its activities unless the setting said otherwise;
- scenarios carried a `pilotIncludedInBudget` boolean;
- the Spending editor kept an `isPiloting` flag in step with the category.

All of it is gone. **Whether an activity or a transaction costs this budget
anything is decided by its funding classification** — `personal`, `other`,
`outside` — which is a property every activity and every transaction has, and
which answers the same question generically. Every category now takes a share of
the same total.

What remains, deliberately:

- `BudgetBucket` still contains `"piloting"` and `SpendingEntry.isPiloting` and
  `Settings.pilotIncludedInBudget` are still declared, marked deprecated.
  Records in the wild carry those values and must round-trip unchanged. Nothing
  reads them. **Do not read them.**
- The `bucket` field is no longer asked for in the category editor. It was a
  required four-way choice whose only behaviour was the one described above, so
  it had become a question nobody could answer without reading the source.

---

# Dashboard Philosophy

The dashboard is the application's homepage.

Users should understand their financial situation within five seconds.

The dashboard should answer:

How much can I spend?

Am I overspending?

How healthy is my budget?

How much have I saved?

What recurring expenses are coming?

What will happen by the end of the month?

Everything else is secondary.

---

# Mobile Philosophy

The mobile version should not simply shrink the desktop version.

It should feel like a native application.

Every screen should remain usable with one hand.

No horizontal scrolling.

No overlapping cards.

Large touch targets.

Readable typography.

---

# Long-Term Goal

This project is intended to become a portfolio-quality application.

Every future change should move the project closer to that goal.

Avoid quick fixes.

Prefer sustainable engineering.

---

# Before Making Any Changes

Read:

CODEX_MASTER_GUIDE.md

ARCHITECTURE.md

DATABASE.md

ROADMAP.md

Only then begin implementation.

Never modify code blindly.
