# CONTRIBUTING_AI.md

> Instructions for AI assistants contributing to this repository.

This file applies to:

ChatGPT

Codex

Claude

Gemini

Kimi

DeepSeek

Cursor

GitHub Copilot

Any future AI.

---

# Your Role

You are NOT here to rewrite the project.

You are joining an existing engineering team.

Act accordingly.

Understand the architecture before changing it.

---

# Before Writing Code

Read:

README.md

CODEX_MASTER_GUIDE.md

AI_CONTEXT.md

ARCHITECTURE.md

DATABASE.md

ROADMAP.md

KNOWN_ISSUES.md

Only then begin implementation.

Never start editing immediately.

---

# First Rule

Understand first.

Code second.

---

# Preserve Existing Behaviour

Unless explicitly requested:

Never rewrite architecture.

Never replace libraries.

Never change folder structure unnecessarily.

Never remove existing features.

Never simplify financial logic.

Never rewrite working code because another approach is "cleaner".

Incremental improvement is preferred.

---

# Financial Rules

Never break:

Budget calculations

Recurring expenses

Currency conversion

Historical snapshots

Budget approvals

Transaction history

Category hierarchy

If uncertain—

stop and investigate.

Financial correctness has priority over aesthetics.

---

# UI Rules

The application should always move toward:

Cleaner

Simpler

More elegant

Better organised

More accessible

More responsive

Avoid adding clutter.

Avoid adding unnecessary buttons.

Avoid overwhelming the user.

---

# Design Philosophy

Think:

Apple

Linear

Notion

Copilot Money

Monarch

Revolut

Arc Browser

Do NOT copy these products.

Understand their qualities.

Build something original.

---

# Coding Style

Write:

Readable code

Small functions

Reusable components

Strong typing

Meaningful names

Minimal duplication

Avoid:

Magic numbers

Nested logic

Duplicated components

Large files

Repeated calculations

---

# Refactoring

Refactor only when:

It improves readability.

It reduces duplication.

It improves maintainability.

It preserves behaviour.

Never refactor simply because you prefer another style.

---

# Documentation

Every significant feature should include:

Updated documentation

Comments where necessary

Meaningful commit messages

Keep `implementation_plan.md` as the single live task tracker. Mark a task complete only after its implementation and stated verification are both complete; record browser, deployment, or database limitations explicitly rather than treating a successful TypeScript build as end-to-end proof.

Changelog entry if appropriate

---

# Mobile

Every feature must work on:

Desktop

Tablet

Phone

Never assume desktop only.

---

# Testing

Before finishing:

Verify:

Application builds

Server builds

Transactions work

Budget works

Recurring expenses work

Historical mode works

Currency conversion works

Dashboard loads

Mobile layout works

No console errors

No API errors

Deployment succeeds

---

# Error Handling

Always prefer:

Useful errors

Validation

Helpful messages

Graceful failure

Never fail silently.

---

# Performance

Think before optimising.

Measure before optimising.

Optimise only when useful.

Prefer readability over micro-optimisation.

---

# Security

Validate all user input.

Never trust the frontend.

Protect financial data.

Avoid exposing internal errors.

Prepare architecture for authentication.

---

# Commits

Commits should be:

Small

Focused

Descriptive

Examples:

feat: add recurring budget suggestions

fix: correct currency conversion rounding

refactor: simplify dashboard layout

docs: update AI architecture guide

Avoid giant commits.

---

# Pull Requests

Every PR should explain:

What changed.

Why it changed.

How it was tested.

Possible risks.

Future improvements.

---

# If You Discover Something Better

You are encouraged to improve the project.

However:

Explain why.

Preserve compatibility.

Avoid unnecessary rewrites.

Prefer incremental evolution.

---

# Ultimate Goal

This repository should become a production-quality personal finance platform.

Every contribution should move the project closer to:

Professional quality

Maintainability

Reliability

Performance

Accessibility

Beautiful UI

Trustworthy financial calculations

Long-term scalability

Always ask yourself:

"Will this change make the project better six months from now?"

If the answer is yes—

proceed.

If the answer is uncertain—

investigate first.

If the answer is no—

find a better solution.

---

# Final Principle

Leave the codebase cleaner than you found it.

Every improvement matters.

Small improvements accumulate into exceptional software.
