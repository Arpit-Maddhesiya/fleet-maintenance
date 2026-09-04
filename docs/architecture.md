# Architecture

A single Next.js 16 App Router application serves both the API and the UI. There is no separate backend process — route handlers under `src/app/api/` and pages under `src/app/` live in the same deployable, which keeps deployment to one platform (Vercel) and removes any CORS/credential dance between a frontend and API on different origins.

## The moving pieces, and how they talk to each other

- **Next.js 16 App Router** — pages are React Server Components by default (`(app)` layout, `/dashboard`, `/login`); interactive surfaces are client components that fetch the app's own API. Every API endpoint is a `route.ts` under `src/app/api/`. Handlers are deliberately thin: *authenticate → validate → run the domain rule → one Prisma call (or a transaction) → shape the response*.
- **Prisma + Neon Postgres** — the only store. Prisma Client is generated to `src/generated/prisma` (not `node_modules`) and connects through the Neon serverless adapter (`src/lib/db.ts`). Migrations run against a separate `DIRECT_URL`; the app uses the pooled `DATABASE_URL`.
- **Auth.js (next-auth v5), Credentials provider, JWT sessions** — no session table. The JWT carries `id` and `role`; `requireRole()` in `src/lib/auth.ts` is the server-side guard every privileged route calls. `src/proxy.ts` (Next 16's renamed middleware) redirects logged-out visitors to `/login` — explicitly *not* the authorization boundary, which lives in the handlers.
- **Domain logic as pure modules** — `src/lib/service-lifecycle.ts` (the Due → Booked → In Service → Completed state machine), `src/lib/overdue.ts` (grace period + `isOverdue`), and the timezone-explicit calendar helpers in `src/lib/local-week.ts` / `src/lib/local-day.ts` contain the business rules with **no database access**. Route handlers load data, call the pure function, and persist the returned patch. That is why the rules are unit-testable without a database and live in exactly one place — the dashboard, the alerts route, and the daily-reports route all share the same `isOverdue` and the same local-day math.
- **Validation with Zod** — request bodies and query strings are parsed by schemas in `src/lib/validation/` before anything touches the DB; shape errors return 400 with field details. The UI surfaces those same field errors inline via `fieldErrorsOf()` in `src/lib/api-client.ts`, so there is one error vocabulary from schema to screen.
- **A shared typed error boundary** — `handleError()` in `src/lib/api.ts` maps typed errors (`UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ZodError`, Prisma `P2002`) to JSON status codes. Route handlers read as happy-path logic; status mapping lives in one file.
- **Role-aware frontend** — pages fetch through `apiFetch<T>()` (adds credentials, parses JSON, throws a typed `ApiError`). The UI hides controls a role may not use (`app-nav.tsx`, `RoleRestrictedPage`), and this is documented in the code as cosmetic: the same request a hidden button would have made still returns 403 server-side.
- **Vitest** — unit/integration tests mock `@/lib/db` and `@/lib/auth`; a `next/server` stub (`src/test/next-server-stub.ts`) lets route handlers run in a plain Node environment. The timezone helpers are tested against fixed instants across `Asia/Kolkata`, `America/New_York`, and DST boundaries.

## Where each piece runs

- **Application code**: the Next.js server (localhost in dev; Vercel in prod). Route handlers run server-side only; nothing sensitive ships to the browser.
- **Database**: Neon serverless Postgres in `us-east-2`. The app uses the pooled connection; Prisma CLI migrations use the direct connection.
- **Sessions**: stateless JWTs — no server-side session store. Trade-off documented in `src/lib/auth.config.ts`: fewer moving parts, at the cost of not being able to revoke a session instantly.

## The timezone convention

The server does not know the user's timezone; the browser does. Client pages send it as an `X-Timezone` header (e.g. `Asia/Kolkata`), and `timezoneFromHeader()` validates it against `Intl`, falling back to UTC. "This week", "last 8 weeks", "today", and the daily-report 5 PM gate are all computed server-side from that header using calendar parts resolved through `Intl` — never from the server's own local clock, and never from a raw UTC day, which would drift for anyone east of UTC. This matters because a completion at 23:30 Sunday in IST is already "next week" for the viewer while still "this week" in UTC; the weekly chart and the daily-report "did they file today" question have to agree with what the user sees on their own calendar.

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

A second, representative path for the newer feature: "a technician files today's daily report at 6 PM local" (`POST /api/daily-reports`). Same skeleton, but the timezone arrives via `X-Timezone`; the handler computes the caller's local "today" and the 17:00 cutoff with the pure local-day helpers, rejects with 403 before 5 PM, and `upsert`s on `(authorId, reportDate)` so a second submit *edits* the day's report rather than duplicating it.

## What we decided *not* to build (and why)

- **Database sessions for Auth.js** — JWT chosen: one fewer table, no per-request session query; revocation wasn't a requirement at this scale.
- **A real-time alerts push** — the nav badge refetches on route change and after mutations (`notifyAlertCountChanged`), which is enough for a fleet of dozens of vehicles. WebSockets/SSE would add moving parts for no user-visible gain here.
- **Hard-deleting anything** — assignments, history events, and alerts are soft-delete/append-only by design (goal 9 and auditability). There is no `DELETE` route for any of them.
- **A separate job/worker for alert creation** — alerts are created lazily on `GET /api/alerts` (`createMany` with `skipDuplicates`), which is correct and race-free thanks to the unique constraint. A cron would be premature at this scale; the schema doc notes it as the first thing to revisit at 100x data.
- **Backfilling past daily reports** — a report is for *today* (after 5 PM local) and stays editable only until local midnight. No "file for yesterday" flow; that keeps the one-per-day unique constraint honest. The seed creates backdated reports so the review screens have history without needing a backfill feature.
- **A `calendar`/`date-picker` UI primitive** — not needed; the daily-reports date filter uses a native `<input type="date">`, which is accessible, timezone-correct in the browser, and zero maintenance.
