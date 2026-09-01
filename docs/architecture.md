# Architecture

The backend is feature-complete for the 10 goals; the frontend is not built yet (the backend prompts stop before frontend work, per the module plan). This document describes the system as it stands.

## The moving pieces, and how they talk to each other

- **Next.js 16 App Router (server components + route handlers)** — every API endpoint is a `route.ts` under `src/app/api/`. Handlers are thin: authenticate → validate → run the domain rule → one Prisma call (or a transaction) → shape the response.
- **Prisma + Neon Postgres** — the only store. Prisma Client is generated to `src/generated/prisma` (not `node_modules`), and connects through the Neon serverless adapter (`src/lib/db.ts`). Migrations use a separate `DIRECT_URL`; the app uses the pooled `DATABASE_URL`.
- **Auth.js (next-auth v5) with a Credentials provider** — JWT session strategy (no session table). The JWT carries `id` and `role`; `requireRole()` in `src/lib/auth.ts` is the server-side guard every privileged route calls.
- **Domain logic as pure modules** — `src/lib/service-lifecycle.ts` (the state machine) and `src/lib/overdue.ts` (grace period + `isOverdue`) contain the business rules with **no database access**. Route handlers load data, call the pure function, and persist the returned patch. This is why the rules are unit-testable without a database and live in exactly one place.
- **Validation with Zod** — request bodies and query strings are parsed by schemas in `src/lib/validation/` before anything touches the DB; shape errors return 400 with field details.
- **A shared error boundary** — `handleError()` in `src/lib/api.ts` maps typed errors (`UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ZodError`, Prisma `P2002`) to JSON status codes, so handlers don't hand-roll status mapping.
- **Vitest** — unit/integration tests mock `@/lib/db` and `@/lib/auth`; a `next/server` stub (`src/test/next-server-stub.ts`) lets route handlers run in a plain Node environment.

## Where each piece runs

- **Application code**: the Next.js server (dev: localhost; prod: wherever it's deployed). Route handlers run server-side only — no client components exist yet, so nothing sensitive ships to the browser.
- **Database**: Neon serverless Postgres in us-east-2. The app uses the pooled connection; Prisma CLI migrations use the direct connection.
- **Sessions**: stateless JWTs — no server-side session store. Trade-off documented in `src/lib/auth.config.ts`: fewer moving parts, at the cost of not being able to revoke a session instantly.

## Request path for one representative action, end to end

Take "a fleet manager books a DUE service record" (`POST /api/service-records/[id]/transition`, action `BOOK`):

1. Next.js routes the request to the handler; the Auth.js session cookie is decoded by `auth()`.
2. `requireRole(Role.FLEET_MANAGER)` rejects a non-manager before anything else runs (403).
3. The JSON body is parsed by `transitionSchema`; invalid → 400 with field details.
4. The handler loads the record (with its vehicle and assignments). Missing → `NotFoundError` → 404.
5. The pure `transition(record, "BOOK", payload)` function validates the move (DUE → BOOKED) and returns a patch — or a reason string (→ 409).
6. Inside a `prisma.$transaction`, the handler applies the patch to the record, creates the `ServiceAssignment`, and writes two `ServiceHistoryEvent` rows (ASSIGNED naming the technician, plus STATUS_CHANGE). All-or-nothing.
7. The updated record is returned as JSON.

The same shape holds everywhere: *guard → validate → load → pure rule → transactional write → respond*.

## What we decided *not* to build (and why)

- **Database sessions for Auth.js** — JWT chosen: one fewer table, no per-request session query; revocation wasn't a requirement at this scale.
- **A real-time alerts push** — the frontend will poll/refetch on navigation (per the frontend plan); server-sent events/websockets would add moving parts for a fleet of dozens of vehicles.
- **Hard-deleting anything** — assignments, history events, and alerts are soft-delete/append-only by design (goal 9 and auditability). There is no `DELETE` route for any of them.
- **A separate job/worker for alert creation** — alerts are created lazily on `GET /api/alerts` (`createMany` with `skipDuplicates`), which is correct and race-free thanks to the unique constraint. A cron would be premature at this scale; the doc notes it as the first thing to revisit at 100x data.
- **The frontend** — deliberately out of scope for this phase; the module plan stops at "backend feature-complete" and starts frontend work next.
