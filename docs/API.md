# API.md

This document explains how the frontend communicates with the backend.

---

# Philosophy

The frontend should never communicate directly with the database.

Instead:

```

React

↓

Services

↓

REST API

↓

Express

↓

Repositories

↓

Neon PostgreSQL

```

Every request should pass through the API.

---

# General Principles

API endpoints should be:

Predictable

RESTful

Consistent

Documented

Versionable

Stateless

Future authentication should be easy to integrate.

---

# Current Functional Areas

Current endpoints are expected to manage:

Transactions

Categories

Historical Snapshots

Activities

Budget Approvals

Settings

Recurring Expenses

## Implemented routes — 2026-08-10

The current Express app exposes the following unversioned routes beneath `/api`:

- `GET`, `PUT /snapshot` and `PATCH /snapshot/settings`
- `GET`, `POST /spending/:year/:month` / `/spending` plus `PATCH`, `DELETE /spending/:id`
- `GET`, `POST /categories` plus category `PATCH` and archive/reorder routes
- `GET /activities/:year`, `POST /activities`, and activity `PATCH`/`DELETE`
- approval read/create/update routes under `/approvals`

The API is served by the same Express app in local development and through `api/[...path].ts` on Vercel. Approved budget records reject subsequent PATCH updates. Spending writes validate finite amounts, date/month consistency, active category references, supported currencies, and recurrence values; a transaction date edit recalculates both its month and ISO week. Validation for the remaining route families is still being expanded.

Future:

Authentication

Accounts

Savings Goals

Notifications

AI

Exports

Imports

---

# Example Endpoint Structure

GET

Retrieve information.

POST

Create new information.

PATCH

Modify existing information.

DELETE

Remove information (prefer soft delete where appropriate).

---

# Transactions API

Responsibilities:

Create transaction

Update transaction

Delete transaction

Retrieve transactions

Search transactions

Filter transactions

Future:

Bulk editing

CSV import

Receipt OCR

Tag support

---

# Categories API

Responsibilities:

Create category

Edit category

Archive category

Delete category

Retrieve category tree

Future:

Nested categories

Icons

Descriptions

Templates

---

# Budget API

Responsibilities:

Current budget

Budget approval

Budget history

Budget suggestion

Budget forecast

Budget comparison

---

# Historical API

Responsibilities:

Load historical periods

Navigate months

Navigate weeks

Navigate years

Retrieve snapshots

Historical comparisons

Historical analytics

Historical exports

Historical reports

---

# Activity API

Responsibilities:

Retrieve activity log

Record actions

Future:

Filter activities

Search activities

Audit history

---

# Settings API

Responsibilities:

Load settings

Update settings

Preferences

Theme

Currency

Dashboard options

Analytics options

Future cloud settings

---

# Response Philosophy

Responses should be predictable.

Example

```

{

success: true,

data: { ... },

error: null

}

```

Errors should return meaningful information.

Never expose internal server details.

---

# Validation

The API should validate:

Numbers

Dates

Currencies

Categories

Recurrence

Budget values

IDs

Never trust client input.

---

# Authentication (Future)

Future API should support:

JWT

OAuth

Refresh Tokens

Sessions

Multiple devices

Secure cookies

Role-based access

Although authentication is not currently implemented, architecture should remain compatible.

---

# Rate Limiting (Future)

Future public deployments should include:

Rate limiting

Request throttling

Brute-force protection

Abuse detection

---

# Logging

Important requests should eventually be logged.

Examples:

Budget approvals

Recurring expense changes

Imports

Exports

Settings modifications

Cloud synchronization

Unexpected errors

These logs help debugging.

---

# Error Handling

Every endpoint should return:

Clear errors

Useful messages

Consistent status codes

Never silently fail.

Never return HTML errors to the frontend.

Always return structured JSON.

---

# Performance

Prefer:

Small payloads

Pagination

Filtering

Caching

Incremental loading

Avoid loading unnecessary information.

---

# Future API Modules

The API should eventually expose:

Savings

Goals

Accounts

Receipts

Investments

Reports

Widgets

Notifications

AI

Cloud synchronization

Sharing

Webhooks

The API should remain modular enough that new modules can be added without changing existing routes.

---

# API Design Rules

Every endpoint should answer:

Who needs this?

Why does it exist?

Can it be reused?

Can it be versioned?

Does it expose unnecessary data?

Can it scale?

---

# Final Philosophy

The API is not merely a bridge between React and PostgreSQL.

It represents the business logic of the application.

Frontend components should remain focused on displaying information.

The backend should remain responsible for validating, processing and protecting financial information.

A clean API today will make future mobile applications, desktop applications and third-party integrations much easier to build.
