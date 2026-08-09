# CODEX MASTER GUIDE
### Budgeting App - Complete Project Specification
**Version:** 1.0
**Author:** Project Vision by Iyad Farah
**Purpose:** Long-term engineering and design specification

---

# Table of Contents

1. Project Overview
2. Project Philosophy
3. Long-Term Vision
4. Current Architecture
5. Core Business Rules
6. Financial Rules
7. Data Integrity Rules
8. Current Feature Set
9. UI / UX Philosophy
10. Development Rules

---

# 1. Project Overview

## What this project is

This project is **NOT** simply a budgeting application.

It is evolving into a **complete personal financial management platform** designed for long-term daily use.

The objective is to create something that feels closer to:

- Copilot Money
- Monarch Money
- Revolut Analytics
- YNAB
- Apple Wallet
- Apple Health
- Linear
- Arc Browser
- Notion

than a traditional budgeting spreadsheet.

This application should become something the user genuinely enjoys opening every day.

It must feel:

- Premium
- Fast
- Beautiful
- Calm
- Intelligent
- Reliable
- Trustworthy

---

## Long-term Goal

Eventually this application should become capable of handling nearly every aspect of someone's personal finances.

Examples:

- budgeting
- recurring expenses
- savings
- forecasting
- financial health
- historical analysis
- spending insights
- statistics
- budgeting recommendations
- recurring payment management
- budgeting goals
- analytics
- multiple currencies
- future cloud synchronization

The application should remain modular enough that these features can continue expanding for years.

---

# 2. Project Philosophy

This application is built around one simple philosophy:

> **Understanding your finances should feel effortless.**

Most budgeting applications either:

- overwhelm the user
- look outdated
- hide useful information
- require too many clicks
- look like spreadsheets

This application should be the opposite.

It should present information naturally.

It should guide the user.

It should explain.

It should predict.

It should never overwhelm.

Every improvement should ask:

> "Does this make understanding my finances easier?"

If not—

don't add it.

---

## Simplicity

Simplicity does NOT mean fewer features.

Simplicity means:

- better organization
- better hierarchy
- better spacing
- better defaults
- better automation

The application should become more powerful while simultaneously becoming easier to use.

---

# 3. Long-Term Vision

Imagine this application in three years.

Someone downloads it.

They open it.

Within five seconds they understand:

- their financial health
- remaining monthly budget
- spending trend
- upcoming recurring payments
- forecast
- savings
- warnings
- recommendations

without reading documentation.

The interface should feel:

professional

minimal

premium

beautiful

fluid

Everything should appear intentional.

Nothing should feel randomly placed.

---

## Future Capabilities

Possible future modules include:

### Budget Planner

Monthly planning

Weekly planning

Yearly planning

Automatic recommendations

AI recommendations

---

### Savings

Goals

Progress

Forecast

Recommendations

Automatic saving suggestions

---

### Investments

Optional future module

Stocks

Crypto

Funds

Performance

---

### AI

Financial assistant

Pattern recognition

Budget suggestions

Warnings

Forecasting

Recommendations

Natural language search

---

### Cloud

User accounts

Synchronization

Backups

Multiple devices

Offline support

---

These modules should NOT require rewriting the architecture.

Always design for expansion.

---

# 4. Current Architecture

Current stack:

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

Version Control

- GitHub

---

## Current Structure

The project already contains:

Frontend

Backend

Database layer

Repositories

Services

Routes

Persistence

Historical snapshots

Recurring expenses

Analytics

Currency conversion

Budget approvals

Activity logging

This architecture must remain.

---

## NEVER rewrite the project.

Improve it.

Refactor it.

Extend it.

Never restart.

Never replace large sections simply because another implementation is easier.

---

# 5. Core Business Rules

These rules are critical.

Breaking these rules means introducing financial bugs.

---

## Rule 1

A value of **0** is a legitimate user-entered value.

It NEVER means missing data.

Never replace zero.

---

## Rule 2

Missing historical information is represented using:

NaN

undefined

or missing values.

Never convert missing values into zero.

Doing so corrupts historical calculations.

---

## Rule 3

Historical data is immutable.

Viewing historical data should NEVER modify it.

---

## Rule 4

Budget calculations must always remain deterministic.

Given identical inputs—

identical outputs should always be produced.

---

## Rule 5

Never silently "fix" user financial data.

Always ask.

Always validate.

Never guess.

---

## Rule 6

Financial calculations are more important than UI.

If a beautiful interface introduces incorrect calculations—

the implementation is wrong.

---

# 6. Financial Rules

The application exists to produce trustworthy financial information.

Every calculation must prioritize correctness.

---

## Budget

Budget is NOT spending.

Budget is NOT income.

Budget represents the approved monthly spending limit.

---

## Spending

Every spending entry belongs somewhere.

It must support:

category

date

currency

amount

notes

recurrence

payment source

---

## Payment Source

Every expense should support:

Budget

Outside Budget

Someone Else Paid

Gift

Reimbursement

Employer

Other

These sources are important.

They affect analytics.

They should NOT necessarily affect budget calculations equally.

---

## Piloting Category

Piloting is intentionally special.

It should remain visible.

It should remain fully tracked.

However—

it should not distort standard spending analytics.

Normal budget distribution should exclude piloting unless explicitly requested.

---

## Currency

Currency conversion must remain accurate.

The selected display currency should NEVER corrupt stored data.

Store consistent values.

Convert only for presentation.

Always display:

Selected Currency

+

EUR equivalent

unless EUR is already selected.

---

# 7. Data Integrity Rules

The user must trust the application.

Therefore—

data integrity is critical.

---

## Never

Never delete information silently.

Never overwrite history.

Never remove approvals.

Never remove snapshots.

Never remove transactions without confirmation.

---

## Always

Validate input.

Validate dates.

Validate numbers.

Validate recurrence.

Validate categories.

Validate references.

---

## Historical Snapshots

Historical snapshots are one of the application's strongest features.

Protect them.

Never regenerate old snapshots automatically.

Never rewrite historical months.

---

# 8. Current Feature Set

Current implemented concepts include:

Budget

Recurring expenses

Historical periods

Month navigation

Week navigation

Year navigation

Categories

Transactions

Currency conversion

Analytics

Approvals

Activity log

Historical snapshots

Settings

Dashboard

These features must continue working.

Adding features must never break them.

---

# 9. UI / UX Philosophy

The UI should feel closer to Apple software than enterprise software.

The interface should communicate:

clarity

confidence

simplicity

quality

Every screen should feel designed—

not generated.

---

## Inspirations

Apple

Take inspiration from:

- typography
- whitespace
- hierarchy
- polish

---

Linear

Take inspiration from:

- consistency
- spacing
- animations
- quality

---

Notion

Take inspiration from:

- information organization
- readability
- simplicity

---

Copilot Money

Take inspiration from:

- finance dashboard
- budgeting
- analytics
- financial summaries

---

Revolut

Take inspiration from:

- premium finance UI
- beautiful graphs
- spending insights

---

Do NOT copy these products.

Understand WHY they feel good.

Then build something original.

---

# 10. Development Rules

Before writing code—

understand the code.

Read the surrounding files.

Understand dependencies.

Understand state.

Understand business logic.

Never make assumptions.

---

## Every Pull Request Should

Improve readability.

Reduce duplication.

Increase maintainability.

Preserve compatibility.

Improve performance.

Improve consistency.

---

## Every Feature Should

Be responsive.

Be accessible.

Be documented.

Be testable.

Be maintainable.

Be beautiful.

---

## Never

Never break calculations.

Never break persistence.

Never break routing.

Never break database compatibility.

Never break historical data.

Never break recurring expenses.

Never break currency conversion.

Never break budget approvals.

---

## When Unsure

Prefer extending existing systems over introducing new parallel systems.

Consistency is almost always better than novelty.

---

# 11. Dashboard Vision

The dashboard is the heart of the application.

If a user opens the application and only looks at the dashboard for 30 seconds, they should already understand almost everything about their financial situation.

The dashboard should answer the following questions immediately:

- How much money can I still spend?
- How much have I already spent?
- Am I spending too fast?
- Will I exceed my budget?
- Which categories are causing the most expenses?
- Which recurring expenses are coming soon?
- Is this month healthier than the previous one?
- How much am I saving?
- Is my spending trend improving or getting worse?

The dashboard should NOT simply display numbers.

It should explain the numbers.

Every KPI should have context.

Examples:

Budget Remaining

€1,250

↑ €320 better than last month

------------------------

Budget Health

Excellent

92 / 100

On track to finish under budget

------------------------

Forecast

Projected Remaining

€510

If spending continues at the current pace

------------------------

Current Burn Rate

€43 / day

Below your monthly target

------------------------

Savings

€890

+12% compared to last month

The dashboard should become a command center rather than just a homepage.

---

# 12. Analytics Philosophy

Analytics should become one of the strongest parts of this application.

Not because there are many graphs.

Because every graph answers an important question.

Examples of useful analytics:

## Spending

- Daily trend
- Weekly trend
- Monthly trend
- Quarterly trend
- Yearly trend

---

## Budget

- Burn rate
- Remaining budget
- Budget utilisation
- Budget efficiency
- Budget health score
- Forecast until end of month

---

## Categories

- Largest category
- Fastest growing category
- Category evolution
- Category ranking
- Historical comparison

---

## Transactions

- Average transaction
- Median transaction
- Largest expense
- Smallest expense
- Expense frequency

---

## Recurring Expenses

- Monthly recurring total
- Upcoming recurring expenses
- Largest recurring category
- Percentage of recurring spending

---

## Savings

- Monthly savings
- Savings trend
- Projected savings
- Historical savings

---

## Historical Analysis

The application should eventually allow the user to compare:

This Month

vs

Last Month

vs

Same Month Last Year

vs

Year Average

The goal is not simply to display data.

The goal is to help users make better financial decisions.

---

# 13. Database Philosophy

The database should become the single source of truth.

Never duplicate data unnecessarily.

Prefer relationships over duplicated information.

Every entity should have a clear responsibility.

Possible entities include:

Budget

Transactions

Categories

Recurring Expenses

Historical Snapshots

Budget Approvals

Activities

Settings

Exchange Rates

Future:

Accounts

Savings Goals

Investments

Attachments

Documents

Tags

Always prefer extensible schemas.

Never hard-code assumptions that will prevent future features.

---

# 14. Design System

The project should gradually evolve into using a proper design system.

The design system should define:

Typography

Spacing

Colours

Animations

Border Radius

Icons

Buttons

Cards

Dialogs

Inputs

Dropdowns

Charts

Every component should follow these rules.

Never invent a new style if an existing one can be reused.

Consistency is more important than originality.

---

## Typography

Prefer a clean sans-serif font.

Large headings should feel elegant.

Numbers should stand out.

Secondary information should remain subtle.

---

## Spacing

Prefer larger spacing over cramped layouts.

Every section should breathe.

Cards should never touch.

Margins should remain consistent.

---

## Buttons

Buttons should have:

Hover state

Focus state

Disabled state

Loading state

Pressed state

Every button should behave consistently.

---

## Dialogs

Dialogs should:

Animate smoothly

Have consistent spacing

Be keyboard accessible

Trap focus correctly

Support Escape

Support Enter

---

# 15. Mobile Experience

The mobile version should feel like a native application.

Current issues should be eliminated.

Examples:

❌ Tiny buttons

❌ Overflowing cards

❌ Horizontal scrolling

❌ Cramped spacing

❌ Difficult navigation

Replace them with:

Large touch targets

Comfortable spacing

Bottom-friendly interactions

Smooth scrolling

Responsive charts

Collapsible sections

Mobile-first thinking.

Do not simply shrink the desktop version.

Design specifically for phones.

---

# 16. Performance Philosophy

Performance is part of the user experience.

Avoid unnecessary:

re-renders

database queries

API calls

state updates

animations

large bundles

Prefer:

lazy loading

memoization

component splitting

code reuse

efficient rendering

The application should remain fast even after several years of additional features.

---

# 17. Testing & Quality Assurance

Every significant modification should be verified.

At minimum, ensure:

✔ Budget calculations still work

✔ Currency conversion remains correct

✔ Historical mode still works

✔ Transactions are saved correctly

✔ Recurring expenses calculate correctly

✔ Budget approvals still function

✔ Dashboard statistics remain accurate

✔ Mobile layout still works

✔ Desktop layout still works

✔ No console errors

✔ Build succeeds

✔ Deployment succeeds

Never assume a feature still works after changing it.

Verify it.

---

# 18. Deployment

The application should remain easy to deploy.

Current deployment target:

Vercel

Version control:

GitHub

Future deployments should require as little manual work as possible.

Production deployments should always build successfully before being considered complete.

Future possibilities:

Docker

Custom domain

CI/CD

Preview deployments

Automatic testing before deployment

---

# 19. Future Roadmap

The following ideas should be considered potential future features.

These are not mandatory immediately, but the architecture should remain compatible with them.

## Financial Accounts

Cash

Bank Accounts

Savings Accounts

Credit Cards

---

## Savings Goals

Vacation

Car

Emergency Fund

House

Custom goals

---

## Tags

Allow transactions to have tags.

Examples:

Holiday

Work

Family

Medical

Education

---

## Attachments

Allow receipts.

Invoices.

Photos.

Documents.

---

## Search

Powerful global search.

Search by:

Category

Date

Amount

Notes

Tag

Recurring

Payment source

---

## AI Assistant

Long-term vision:

AI-powered financial insights.

Examples:

"You spent 14% more on transport this month."

"You could save approximately €120 next month by reducing restaurant spending."

"You have three recurring expenses due next week."

The AI should explain.

Not merely calculate.

---

# 20. Instructions to Every Future AI

If you are reading this file, you are contributing to an existing project.

Treat this project with respect.

Do not rewrite it because it is easier.

Understand it.

Improve it.

Refactor carefully.

Preserve history.

Preserve business logic.

Preserve calculations.

Preserve user trust.

When implementing new features:

- Follow the existing architecture.
- Improve consistency.
- Reduce technical debt.
- Reuse components.
- Keep the interface clean.
- Think about mobile first.
- Think about long-term maintainability.
- Document major changes.
- Prefer small, safe, incremental improvements.

If you identify bugs, fix them.

If you identify duplicated code, refactor it.

If you identify inconsistent UI, standardize it.

If you identify performance bottlenecks, optimize them.

Never sacrifice correctness for aesthetics.

Never sacrifice maintainability for speed.

Never sacrifice user trust for convenience.

The ultimate goal is not simply to write code.

The ultimate goal is to create a financial application that users trust with their money every single day.

Every design decision should answer:

"Does this make the application clearer, more reliable, more enjoyable, and more useful?"

If the answer is yes, proceed.

If the answer is no, rethink the solution.

---

# Final Note

This project is intended to become a polished, production-quality personal finance platform.

Its success is measured not only by the number of features, but by:

- Reliability
- Correctness
- Simplicity
- Consistency
- Beauty
- Performance
- Accessibility
- User Trust

The application should feel like software built by a team of experienced product designers and engineers—not like a collection of unrelated features.

Always leave the project in a better state than you found it.