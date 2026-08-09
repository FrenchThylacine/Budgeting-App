# Engineering decisions

This file records decisions that affect future changes to the Budgeting App.

## 2026-08-10 — One Express app for local and Vercel execution

**Decision:** Keep Express as the REST API and separate application construction from process startup.

**Implementation:** `server/src/app.ts` exports the shared application. `server/src/index.ts` only starts the local listener, while `api/[...path].ts` exports the same application for Vercel Functions.

**Why:** This avoids separate route implementations for development and deployment, and prevents a Vercel import from opening a long-lived local listener.

**Status:** TypeScript builds pass. A Vercel preview remains required to verify platform routing and environment configuration.

## 2026-08-10 — Explicit persisted theme selection

**Decision:** Theme is controlled by the existing persisted `settings.darkMode` setting rather than system-preference detection.

**Implementation:** The React application synchronizes the setting to `html.dark` and `color-scheme`.

**Why:** The user has made an explicit application-level choice. Scoping tokens to the root ensures page-level colors, native form controls, dialogs, and mobile navigation receive the same palette.

**Status:** Builds pass; browser light/dark verification remains open.

## Open decision — Snapshot write model

The current nested-record delete-and-reinsert persistence strategy has not been accepted as a long-term architecture. Replace it with targeted transactional writes only after a Neon-backed behavior audit and migration plan are in place; do not make an unverified rewrite.
