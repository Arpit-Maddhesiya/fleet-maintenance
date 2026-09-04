# Decisions

These are the decisions that shaped the system, in roughly the order they were made. The first five are from the backend build; the rest came later as the frontend, the admin role, and the stretch feature forced real choices. Each records what was chosen, what was rejected, and why.

## Decision 1: Explicit `ServiceAssignment` join table instead of an implicit many-to-many

- **Chose:** A real `ServiceAssignment` model with `assignedAt` / `unassignedAt` columns, one row per assignment.
- **Rejected:** Prisma's implicit many-to-many (`serviceRecord.technicians` / `technician.serviceRecords`).
- **Why:** The brief demands assignment *history* — who was assigned when, who was unassigned, and an audit timeline that names technicians. An implicit relation stores only the current state and silently forgets the past. The explicit table also gives us the natural place to attach the audit event and to scope a technician's visible records (`unassignedAt IS NULL`).

## Decision 2: JWT sessions instead of database sessions for Auth.js

- **Chose:** JWT session strategy; the token carries `id` and `role`, and `requireRole()` checks it.
- **Rejected:** Database-backed sessions (Prisma adapter, session table).
- **Why:** Fewer moving parts for a project this size — no session table, no per-request session lookup, no cleanup of expired rows. The cost is that a session can't be instantly revoked server-side; it lives until the JWT expires. That trade-off is acceptable here (documented in `src/lib/auth.config.ts`), and would be revisited if we needed admin-driven sign-out-everywhere.

## Decision 3: Pure domain modules instead of rules embedded in route handlers

- **Chose:** `src/lib/service-lifecycle.ts` (state machine) and `src/lib/overdue.ts` (grace period + `isOverdue`) as pure functions with zero database access; route handlers call them and persist the patch. Later, the timezone-explicit calendar helpers in `src/lib/local-week.ts` / `src/lib/local-day.ts` followed the same pattern.
- **Rejected:** Letting each route handler implement its own status rules and cutoff math.
- **Why:** The lifecycle rules are the heart of the brief, and they're easy to get subtly wrong ("can a DUE record be STARTed directly?"). Isolating them makes them trivially unit-testable, keeps the definition in exactly one place (the dashboard and the alerts route share the same `isOverdue`), and forces the handlers to stay thin. It also makes the "illegal move" messages consistent across every caller. The daily-reports "after 5 PM local" rule is the same argument one level up: a `17:00` cutoff scattered across routes would drift the first time anyone changed it.

## Decision 4: The `Alert(vehicleId, serviceCycle)` unique constraint as the mechanism for the reappearance rule

- **Chose:** Rely on the database unique constraint + lazy `createMany(..., skipDuplicates: true)` on `GET /api/alerts`; an alert is keyed by the vehicle's current cycle, which increments on every completed service.
- **Rejected:** A "don't re-alert this vehicle" flag on the vehicle or a manual check-then-insert in the route.
- **Why:** The brief's exact rule — dismissing cycle N must *not* suppress a new alert for cycle N+1 — falls out of the constraint for free: a new cycle is a new row. A boolean "alerted" flag would have to be carefully reset on every completion and would be wrong the moment a vehicle is archived/restored or a record is re-opened. `skipDuplicates` also makes the lazy create race-free without a check-then-create window. This is the decision that made the reappearance test pass by construction rather than by luck.

## Decision 5: Route handlers reject with typed errors, mapped once in `handleError`

- **Chose:** Routes throw `UnauthenticatedError` / `ForbiddenError` / `NotFoundError` (and let Zod/Prisma errors bubble), all mapped to JSON status codes in `src/lib/api.ts`.
- **Rejected:** Each route returning `NextResponse.json({ error }, { status })` inline.
- **Why:** Consistent status codes and error shapes across ~25 endpoints, and handlers that read as happy-path logic. The one-off mapping lives in exactly one place, so changing an error format is a one-file change.

## Decision 6: Adding an `ADMIN` role (schema evolution, not a clean two-role design)

- **Chose:** Extend the `Role` enum with `ADMIN`, make `requireRole` treat admin as always-allowed (`allowedRoles` in `src/lib/roles.ts`), and build a Users page where admins create/delete `FLEET_MANAGER` and `TECHNICIAN` accounts.
- **Rejected:** Leaving the system with only the brief's two roles and no way to create accounts except the seed script; also rejected was letting a fleet manager create accounts (they already have a lot of power, and "who watches the watchers" is a real question once more than one manager exists).
- **Why:** The brief says "at least two roles", and a real deployment needs someone who can administer users without being able to also quietly edit every service record in ways that leave the same audit trail. Admins get the fleet-wide manager view plus user management. The seed file cannot create `ADMIN` accounts via the API (the create-user schema deliberately excludes the role) — admin is seed-only, which keeps the bootstrap path small.

## Decision 7: One `DailyReport` table for both form types instead of two

- **Chose:** A single model with a `type` discriminator; a technician's `jobsCompleted`/`hoursWorked`/`registrations` and a manager's `bookingsCount`/`inspectionsCount` share the row, with the unused columns left at zero/empty. The POST body is a Zod discriminated union, so a technician can never submit a manager-shaped payload (the server rejects a type/role mismatch with 403).
- **Rejected:** Two separate tables (`TechnicianDailyReport`, `ManagerDailyReport`).
- **Why:** The two forms share everything structural — author, date, uniqueness, timestamps — and the read paths never need to join the two shapes together. Two tables would have meant duplicating the "one per person per day" constraint, the role-scoping queries, and the DTO mapping for zero query benefit. The discriminator keeps the invariant ("a report belongs to exactly one author and one local day") in one place.

## Decision 8: `DailyReport.reportDate` stores the local-midnight *instant*, not the UTC day

- **Chose:** `reportDate` is the UTC instant of local midnight of the report's day in the author's timezone (computed from the `X-Timezone` header at write time), with a `@@unique([authorId, reportDate])`.
- **Rejected:** Storing `YYYY-MM-DD` as a string, or storing the UTC calendar date of filing.
- **Why:** "Today" is a property of the viewer's clock. A technician in IST filing at 6 PM local is still on the same UTC date for another 5.5 hours — a raw UTC-day key would either let them file twice in one local day or collapse two local days into one, depending on which side of the line they sit. Storing the local-midnight instant keeps "one report per person per *their* local day" true in every zone and across DST, because the instant is just a timestamp and the uniqueness is on (author, instant-of-local-midnight). The cost is that reads must compute the same local-day window from the header — which is exactly what the shared helpers do.

## Decision 9: The viewer's timezone travels as an `X-Timezone` header

- **Chose:** Client pages send `Intl.DateTimeFormat().resolvedOptions().timeZone` as an `X-Timezone` header; the server validates it with `timezoneFromHeader()` (falling back to UTC) and does all "which day/week" math with pure `Intl`-based helpers.
- **Rejected:** Server-side timezone config (env var or a company-timezone setting), or doing the bucketing client-side.
- **Why:** The server genuinely does not know where the user is; the browser does. A server-configured zone would be wrong for anyone not in it, and client-side bucketing would move the definition of "this week" and "after 5 PM" out of the tested server code and into every page. The header keeps the rule server-side and authoritative while staying correct for whoever is logged in. (For a single-site fleet this is arguably over-engineered — but the daily-report 5 PM gate is a hard rule, and hard rules should not depend on which server or which user's machine happens to be authoritative.)

## Decision 10: The dashboard "Completed services" KPI is a lifetime total, deep-linked to `status=COMPLETED`

- **Chose:** The fourth KPI card shows the all-time count of COMPLETED records and links to the records list pre-filtered to `status=COMPLETED`.
- **Rejected:** (Initially) a "Completed this week" card deep-linking to a `completedThisWeek=true` list filter.
- **Why:** See the reversed decision below. The lifetime total is already computed for the status-distribution chart (`byStatus.COMPLETED`), so the card added zero queries, and its deep link goes to a filter the list endpoint genuinely supports — no new query-param surface, no list endpoint that has to learn a timezone-aware filter.

## Reversed decision: timezone-aware "completed this week" list filters (started, then abandoned, then deleted)

- **What I first chose:** After making the dashboard's weekly buckets timezone-correct, I started extending the same treatment to the *list* endpoint — adding a `completedThisWeek=true` query param (and an `updated=true` "edited after completion" filter) so the KPI card could deep-link to exactly the records behind the number. I added tests for both filters and wrote the timezone helpers for them.
- **What changed my mind:** Three things converged. (1) The "completed this week" number on the dashboard is a fleet-wide KPI, but the records list is also the place people go to *act*; a filter that silently changes meaning based on the viewer's timezone is more confusing than helpful for a single-site fleet. (2) The `updated=true` filter was solving a problem the seed had already fixed (backdated `updatedAt`), so it was speculative. (3) Most concretely: the KPI was later changed to a lifetime "Completed services" total anyway, which removed the *reason* the list filter existed. The right move was to delete the half-built filters and their tests rather than ship a feature nobody asked for.
- **What I did about it:** For a while I parked the half-built work in the working tree instead of deleting it — which left two failing tests in `service-records/__tests__/list.test.ts` and uncommitted remnants of the `completedThisWeek`/`updated` params, exactly the kind of loose end that reads badly to a reviewer running the suite. I later deleted the abandoned tests and scripts outright and reverted the list test file to its committed state. The lesson I took: a good idea that stops being needed should be deleted immediately, not parked — parking it just turns a clean rejection into a dirty working tree.
