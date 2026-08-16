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

## Implemented routes — 2026-08-15

The Express app exposes these unversioned routes beneath `/api`, served identically in local development and through `api/[...path].ts` on Vercel:

- `GET /health`
- `GET`, `PUT /snapshot` and `PATCH /snapshot/settings`
- `GET /spending/:year/:month`, `POST /spending`, `PATCH`/`DELETE /spending/:id`
- `GET`, `POST /categories`, `PATCH /categories/reorder`, `PATCH /categories/:id`, `PATCH /categories/:id/archive`
- `GET /activities/:year`, `POST /activities`, `PATCH`/`DELETE /activities/:id`
- approval read/create/update routes under `/approvals`

> **Which routes the client actually uses.** `src/store/budgetStore.ts` persists exclusively through `GET`/`PUT /snapshot`. The per-entity routes are implemented and validated but are not on the live write path today, so their validation does not constrain the app. Treat `PUT /snapshot` as the endpoint that must be correct.

### `GET /api/health`

Answers even when the database is unreachable, so a misconfigured database is distinguishable from a dead server.

- `200 {"status":"ok","database":"connected"}`
- `503 {"status":"degraded","database":"unavailable","message":"..."}`

### `GET /api/snapshot/revision`

Cheap freshness probe — `{ "revision": 12 }` — so a client can detect another device's write without transferring the whole snapshot. Used on window focus.

### `PUT /api/snapshot` — compare-and-swap concurrency

The body must be an object carrying `settings` (object), `categories` (array), and `years` (object keyed by year); `seasonalPresets`, `scenarioPresets`, `budgetApprovals`, and `auditLog` must be arrays when present, and `revision` must be a finite number when present. A partially-shaped payload is rejected rather than applied, because the targeted-delete pass would otherwise truncate the collections it omits.

Send `baseRevision` — the revision the client last read from the server — either in the body or as an `x-base-revision` header. The write is accepted only when it still matches the stored revision, and the **server** assigns the next one:

```
200 OK
{ "success": true, "message": "Snapshot saved", "revision": 13 }
```

Otherwise:

```
409 Conflict
{ "error": "Snapshot conflict",
  "message": "Rejected stale write (based on revision 11, server is at 13).",
  "revision": 13,
  "snapshot": { ...current server snapshot... } }
```

Clients adopt the returned snapshot and re-apply their change.

The client's own `revision` field is **not** trusted for concurrency. A device that edited while offline keeps incrementing its counter, so it could return with a higher number than the server and overwrite another device's work; `baseRevision` cannot be inflated to win, because a stale base is precisely what is rejected. Requests without `baseRevision` fall back to the older monotonic check so legacy clients keep working, but they forfeit the stronger guarantee.

### Error semantics

- `400` — malformed JSON, wrong payload shape, or a failed field validation. Body-parser failures are surfaced as 400 rather than as an opaque 500.
- `404` — no snapshot stored yet, or unknown entity id.
- `409` — stale snapshot write (see above).
- `503` — database unavailable; the message names the missing `DATABASE_URL`.

### Validation coverage

Spending writes validate finite amounts, date format, date/month agreement, active category references, supported currencies, and recurrence values; a date edit recalculates month, ISO week, **and year**, moving the entry into the matching year record. Category writes validate name, bucket enum, colour, non-negative cap, and parent references, rejecting self-parenting and cycles. Activity writes validate year, category reference, currency, recurrence type and interval, and non-negative prices. Approvals reject any re-proposal or mutation of an already-approved month.

Known gaps are tracked in `docs/KNOWN_ISSUES.md` — most notably that `PATCH /snapshot/settings` spreads the request body without per-field validation, and that no route enforces historical/closed-period write protection.

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

# Authentication

Implemented. Every route under `/api` except `/api/health` and `/api/auth/*` requires a session.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` | public | Create an account. `201` with `{ user }`, `409` `email_taken`, `403` `invite_required`. |
| `POST` | `/api/auth/signin` | public | `200` with `{ user }`, `401` `invalid_credentials`, `429` `rate_limited`. |
| `POST` | `/api/auth/signout` | public | Deletes the session server-side and clears the cookie. |
| `GET` | `/api/auth/me` | public | `200` with `{ user }` or `{ user: null }` — never `401`. |
| `POST` | `/api/auth/forgot-password` | public | Always `200` with the same body. |
| `POST` | `/api/auth/reset-password` | public | `400` `invalid_token` if unknown, expired, or already used. |
| `POST` | `/api/auth/change-password` | session | Requires the current password. |

`/api/auth/me` answers `200` with `user: null` rather than `401` because the app uses it to decide which screen to show on load; a `401` there would be indistinguishable from a session that expired mid-use.

## Passwords

scrypt from `node:crypto` — no native module to compile, which matters on Vercel where a binding that fails to load takes the whole deployment down. Salt per password, comparison via `timingSafeEqual`.

Cost parameters are stored **inside** each encoded hash rather than read from configuration at verification time, so raising the cost later does not invalidate every existing password. A hash made with weaker parameters still verifies and is re-hashed on the next successful sign-in.

Minimum length 10, and length is the only rule. Composition requirements measurably push people towards `Password1!` and its cousins.

## Sessions

Opaque random tokens (32 bytes, CSPRNG), stored as their SHA-256, delivered in a cookie:

- `HttpOnly` — unreadable from JavaScript, so an XSS cannot exfiltrate it.
- `Secure` — set when the request arrived over HTTPS. Not unconditional, or local development could never sign in.
- `SameSite=Lax` — not `Strict`, which would drop the cookie when arriving from a reset link in an email client. `Lax` still blocks the cross-site POST case that matters.

Opaque rather than JWT because they must be **revocable**: signing out ends the session immediately, and a password reset invalidates every session that existed beforehand. Expiry is compared in the database, so a wrong clock on one serverless instance cannot extend a session.

## Account isolation

Each account owns exactly one budget (`users.snapshot_id`, unique). `BudgetService` takes that id in its constructor and every repository call is scoped to it; `requireAuth` is applied once to `/api` rather than route by route, because a per-route guard is one forgotten line away from exposing a budget.

The **first account created adopts the pre-existing `active` budget**, so introducing accounts does not orphan data the app was already holding.

## Not implemented

OAuth, refresh tokens, and role-based access. The single-owner model has no roles to assign, and refresh tokens solve a problem revocable server-side sessions do not have.

---

# Rate Limiting

Implemented for the endpoints that can be ground through.

| Endpoint | Buckets | Limit |
|---|---|---|
| `/api/auth/signin` | email, client IP | 10 per 15 minutes |
| `/api/auth/forgot-password` | email | 5 per hour |

Two buckets on sign-in, not one: an email bucket stops a single account being ground through, an IP bucket stops one source spraying many accounts. Neither covers both.

Counters live in the **database**, not in memory. Serverless instances share no memory, so an in-process counter resets on every cold start and is per-instance besides — it would cap nothing under the traffic it exists to stop.

Exceeding the sign-in limit returns `429` with `code: "rate_limited"`. Exceeding the reset limit still returns the normal `200`: a `429` there would confirm that the address has an account.

---

# Account enumeration

Several responses are deliberately identical where a naive implementation would differ.

- `signin` returns the same status and the same message for an unknown email and a wrong password.
- `forgot-password` returns the same body whether or not the address has an account, whether or not it was rate limited, and whether or not the email provider accepted the message. A missing `RESEND_API_KEY` must not become an observable difference.

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
