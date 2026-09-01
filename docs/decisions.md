# Decisions

## Decision 1: Explicit `ServiceAssignment` join table instead of an implicit many-to-many

- **Chose:** A real `ServiceAssignment` model with `assignedAt` / `unassignedAt` columns, one row per assignment.
- **Rejected:** Prisma's implicit many-to-many (`serviceRecord.technicians` / `technician.serviceRecords`).
- **Why:** The brief demands assignment *history* — who was assigned when, who was unassigned, and an audit timeline that names technicians. An implicit relation stores only the current state and silently forgets the past. The explicit table also gives us the natural place to attach the audit event and to scope a technician's visible records (`unassignedAt IS NULL`).

## Decision 2: JWT sessions instead of database sessions for Auth.js

- **Chose:** JWT session strategy; the token carries `id` and `role`, and `requireRole()` checks it.
- **Rejected:** Database-backed sessions (Prisma adapter, session table).
- **Why:** Fewer moving parts for a project this size — no session table, no per-request session lookup, no cleanup of expired rows. The cost is that a session can't be instantly revoked server-side; it lives until the JWT expires. That trade-off is acceptable here (documented in `src/lib/auth.config.ts`), and would be revisited if we needed admin-driven sign-out-everywhere.

## Decision 3: Pure domain modules instead of rules embedded in route handlers

- **Chose:** `src/lib/service-lifecycle.ts` (state machine) and `src/lib/overdue.ts` (grace period + `isOverdue`) as pure functions with zero database access; route handlers call them and persist the patch.
- **Rejected:** Letting each route handler implement its own status rules and cutoff math.
- **Why:** The lifecycle rules are the heart of the brief, and they're easy to get subtly wrong ("can a DUE record be STARTed directly?"). Isolating them makes them trivially unit-testable, keeps the definition in exactly one place (the dashboard and the alerts route share the same `isOverdue`), and forces the handlers to stay thin. It also makes the "illegal move" messages consistent across every caller.

## Decision 4: The `Alert(vehicleId, serviceCycle)` unique constraint as the mechanism for the reappearance rule

- **Chose:** Rely on the database unique constraint + lazy `createMany(..., skipDuplicates: true)` on `GET /api/alerts`; an alert is keyed by the vehicle's current cycle, which increments on every completed service.
- **Rejected:** A "don't re-alert this vehicle" flag on the vehicle or a manual check-then-insert in the route.
- **Why:** The brief's exact rule — dismissing cycle N must *not* suppress a new alert for cycle N+1 — falls out of the constraint for free: a new cycle is a new row. A boolean "alerted" flag would have to be carefully reset on every completion and would be wrong the moment a vehicle is archived/restored or a record is re-opened. `skipDuplicates` also makes the lazy create race-free without a check-then-create window. This is the decision that made the reappearance test pass by construction rather than by luck.

## Decision 5: Route handlers reject with typed errors, mapped once in `handleError`

- **Chose:** Routes throw `UnauthenticatedError` / `ForbiddenError` / `NotFoundError` (and let Zod/Prisma errors bubble), all mapped to JSON status codes in `src/lib/api.ts`.
- **Rejected:** Each route returning `NextResponse.json({ error }, { status })` inline.
- **Why:** Consistent status codes and error shapes across ~20 endpoints, and handlers that read as happy-path logic. The one-off mapping lives in exactly one place, so changing an error format is a one-file change.

---

**Later reversed:** the grace-period cutoff was originally duplicated — Module 7's dashboard computed `overdueCount` with its own `dueSince < now - grace` where clause, while Module 9 introduced `isOverdue()` in `src/lib/overdue.ts`. I initially left the dashboard's hand-rolled query in place (it was "already correct" and used the shared constant). What changed my mind: the module plan explicitly says *"Use this same function in Module 7's overdueCount so the definition lives in one place"* — and a reviewer pointed out that two expressions of the same rule will drift the first time someone changes one of them (e.g. an env-tunable grace period). The dashboard now fetches DUE records' `dueSince` and counts with `isOverdue()`, so the rule has one home. Slightly less efficient than a `count()` query, deliberately — the fleet is dozens of vehicles, and correctness of the shared definition matters more.
