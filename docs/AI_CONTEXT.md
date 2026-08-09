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

## Implementation status (2026-08-09)

The React client provides the core budgeting workflows, including transaction, recurring activity, category, wallet, wishlist, scenario, settings, analytics, and historical-summary views. The client blocks period-bound mutations while a past month is selected. Remote Neon persistence is configured through the Express API, with IndexedDB used as an offline fallback; persistence must still be verified against a configured database in a Node.js-capable environment. Consult `implementation_plan.md` for the live, verified status rather than treating this context document as a release checklist.

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

# Piloting Category

Piloting is intentionally treated differently.

It remains a normal expense category.

However—

it should not distort standard category distribution.

Example

Normal budget analysis should compare:

Food

Housing

Transport

Entertainment

etc.

Piloting should be excluded from percentage share calculations unless explicitly requested.

This behaviour is intentional.

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
