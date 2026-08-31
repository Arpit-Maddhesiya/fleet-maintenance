# Fleet Maintenance — Backend Build Prompts (Module-Wise)

## How to use this file

1. Work through modules **in order** — each prompt assumes the previous ones exist.
2. Paste one module's prompt into your coding agent. Let it finish.
3. **Read the diff.** Actually read it. Run `npm run dev` and hit the new endpoints with curl/Thunder Client before moving on.
4. Commit with a message describing what the module does (the prompt tells the agent to suggest one — you write the real commit).
5. Copy the prompt text + a summary of what the agent got wrong (if anything) into `docs/ai-prompts.md` immediately, not at the end. You will not remember by week 2.
6. If the agent's output does something you can't explain, stop and ask it (or me) to explain before continuing. This is the single most common reason candidates fail this round per the brief itself.

Stack assumed: Next.js 15 App Router, TypeScript, Prisma + Neon Postgres, Auth.js v5, Zod, Vitest.

---

## Module 0 — Schema & Migration

```
Context: Fresh Next.js 15 App Router + TypeScript project with Tailwind already set up.
I'm building a fleet maintenance system. Set up Prisma with a Neon Postgres datasource.

Task: Create prisma/schema.prisma with these models and enums exactly as specified below
(do not add fields I haven't asked for, and do not remove any — ask me first if something
seems missing):

- enum Role: FLEET_MANAGER, TECHNICIAN
- enum ServiceStatus: DUE, BOOKED, IN_SERVICE, COMPLETED
- enum HistoryEventType: CREATED, STATUS_CHANGE, ASSIGNED, UNASSIGNED, NOTE
- User: id, email (unique), passwordHash, name, role, createdAt
- Vehicle: id, registrationNumber (unique), make, model, currentOdometer,
  dateIntervalDays, mileageInterval, lastServiceDate, lastServiceOdometer,
  serviceCycle (int, default 1), archivedAt (nullable), createdAt, updatedAt
- ServiceRecord: id, vehicleId (FK), description, status (default DUE),
  scheduledDate (nullable), startedAt (nullable), completedAt (nullable),
  completedOdometer (nullable), dueSince (default now), createdAt, updatedAt
- ServiceAssignment: id, serviceRecordId (FK), technicianId (FK to User),
  assignedAt (default now), unassignedAt (nullable) — this is an EXPLICIT
  join model, not an implicit many-to-many, because I need assignment history,
  not just current state
- ServiceHistoryEvent: id, serviceRecordId (FK), type, fromStatus (nullable),
  toStatus (nullable), note (nullable), actorId (FK to User), createdAt —
  NO updatedAt field, this table must never be updated after insert
- Alert: id, vehicleId (FK), serviceCycle (int), triggeredAt (default now),
  dismissedAt (nullable), dismissedById (nullable FK to User).
  Add a unique constraint on [vehicleId, serviceCycle].

Add indexes on: Vehicle.archivedAt, ServiceRecord.vehicleId, ServiceRecord.status,
ServiceRecord.scheduledDate, ServiceRecord.updatedAt, ServiceAssignment.technicianId,
ServiceAssignment.serviceRecordId, ServiceHistoryEvent.[serviceRecordId, createdAt],
Alert.vehicleId, User.role.

Also:
- Set up .env with DATABASE_URL (pooled, for the app) and DIRECT_URL (direct, for
  migrations) — explain the difference in a comment.
- Run `npx prisma migrate dev --name init` and show me the output.
- Do not write any application code yet — schema and migration only.

After this, tell me in plain language: which relationships are one-to-many vs
many-to-many in this schema, and why ServiceAssignment is a real table instead of
an implicit relation. I need to be able to repeat this explanation myself later.
```

---

## Module 1 — Auth & Role Enforcement

```
Context: Prisma schema from Module 0 already exists and is migrated. Next.js 15
App Router project.

Task: Set up Auth.js v5 (next-auth@beta) with a Credentials provider (email +
password, bcrypt-hashed) backed by the existing User model.

Requirements:
1. Install and configure next-auth v5 with the Prisma adapter, using JWT session
   strategy (not database sessions — explain why in a comment: fewer moving parts
   for a project this size, at the cost of not being able to instantly revoke a
   session).
2. Session's JWT and session object must include the user's `role` and `id` —
   not just email/name.
3. Create a `lib/auth.ts` exporting `auth()`, `signIn`, `signOut`, and a helper
   `requireRole(role: Role)` that I can call at the top of any route handler or
   server action. It should throw a typed error (e.g. ForbiddenError) if the
   session's role doesn't match, and return the session if it does.
4. Add middleware.ts that redirects unauthenticated requests away from any route
   under /dashboard, /vehicles, /records to /login.
5. IMPORTANT: role checks must happen in route handlers / server actions, not
   only in middleware or the UI. Middleware here is just a redirect convenience
   for logged-out users — it is not the authorization boundary. Every mutating
   route handler for fleet-manager-only actions must call requireRole('FLEET_MANAGER')
   itself.
6. Create prisma/seed.ts that creates:
   - one FLEET_MANAGER user: manager@fleet.test / password123
   - two TECHNICIAN users: tech1@fleet.test and tech2@fleet.test, same password
   Hash passwords with bcrypt before inserting. Wire this into package.json's
   prisma.seed config so `npx prisma db seed` works.
7. Build a minimal /login page (server action based, not client-fetch) using
   the existing Tailwind setup — just functional, no styling polish yet.

After this, show me the exact code path a request takes when a TECHNICIAN tries
to hit a fleet-manager-only route handler, from request to 403, so I can trace
it myself.
```

---

## Module 2 — Vehicles CRUD + Archive/Restore

```
Context: Modules 0-1 exist (schema + auth with requireRole helper).

Task: Build the Vehicles resource as Next.js route handlers under app/api/vehicles/.

Endpoints:
- POST /api/vehicles — FLEET_MANAGER only. Body: registrationNumber, make, model,
  currentOdometer, dateIntervalDays, mileageInterval. Validate with Zod (all
  required, currentOdometer/dateIntervalDays/mileageInterval must be positive
  integers, registrationNumber non-empty). On create, set lastServiceDate = now,
  lastServiceOdometer = currentOdometer, serviceCycle = 1.
- GET /api/vehicles — any authenticated user. Returns non-archived vehicles by
  default; accept ?includeArchived=true. No pagination needed here (small list,
  unlike service records later).
- GET /api/vehicles/[id] — any authenticated user. Include its serviceRecords
  (most recent first) in the response — this is "opening a vehicle shows its
  service history" from the brief.
- PATCH /api/vehicles/[id] — FLEET_MANAGER only. Can update make, model,
  dateIntervalDays, mileageInterval. Do NOT allow currentOdometer to be edited
  here — that's a separate concern (bulk update + possibly a dedicated
  reading-update endpoint later), and don't allow lowering it if you do add
  a path for it.
- POST /api/vehicles/[id]/archive — FLEET_MANAGER only. Sets archivedAt = now.
  Does not touch service records.
- POST /api/vehicles/[id]/restore — FLEET_MANAGER only. Sets archivedAt = null.

Every route: use requireRole/auth() from lib/auth.ts, return proper HTTP status
codes (401 unauthenticated, 403 wrong role, 404 not found, 400 validation error
with the Zod error details, 409 for unique constraint violation on
registrationNumber), and use a shared Zod schema file (lib/validation/vehicle.ts)
rather than inlining schemas per route.

Write 3-4 Vitest tests: one for the archive/restore round trip, one for a
technician being rejected on POST, one for the Zod validation rejecting a
negative mileageInterval.

Explain in a comment at the top of the vehicles route file: why archived
vehicles aren't deleted, and what "removes from default fleet view without
destroying history" implies about how GET should filter.
```

---

## Module 3 — Service Lifecycle State Machine

```
Context: Modules 0-2 exist. This is the core domain logic of the whole app —
go slow and be precise here.

Task: Build the ServiceRecord lifecycle as its own testable module, separate
from the route handlers that call it.

1. Create lib/service-lifecycle.ts with a pure function:
   `transition(record: ServiceRecord, action: TransitionAction, payload): TransitionResult`
   where TransitionAction is one of: BOOK, START, COMPLETE, and TransitionResult
   is either { ok: true, patch: Partial<ServiceRecord> } or
   { ok: false, reason: string }.

   Rules to encode exactly:
   - DUE -> BOOKED via BOOK: requires payload.scheduledDate and
     payload.technicianId (at least one technician). Reject any other current
     status with a clear message like "Cannot book a record that is already {status}."
   - BOOKED -> IN_SERVICE via START: no extra payload needed. Reject from any
     other status.
   - IN_SERVICE -> COMPLETED via COMPLETE: requires payload.completedOdometer
     (must be >= vehicle.currentOdometer, reject with reason if not). On success,
     the patch must include completedAt = now and completedOdometer.
   - Any other requested transition (e.g. DUE -> IN_SERVICE directly, or
     COMPLETED -> anything) must return ok:false with a message naming the
     illegal transition explicitly, e.g. "Cannot move from COMPLETED to BOOKED."
   - This function does NOT touch the database. It's pure so it's trivially
     testable and so the rules live in exactly one place.

2. Create app/api/service-records/[id]/transition/route.ts (POST) that:
   - Loads the record + its vehicle in a transaction
   - Calls transition()
   - If ok:false, returns 409 with { error: reason }
   - If ok:true and action === COMPLETE: within the SAME transaction, also
     update the Vehicle: currentOdometer = completedOdometer,
     lastServiceDate = now, lastServiceOdometer = completedOdometer,
     serviceCycle = serviceCycle + 1. This is the "completing a service resets
     both counters" rule — it must be atomic with the record update, not two
     separate writes that could partially fail.
   - Also within the same transaction, insert a ServiceHistoryEvent of type
     STATUS_CHANGE with fromStatus/toStatus/actorId set.
   - Only FLEET_MANAGER can call BOOK (assigns technician + schedules).
     Any assigned technician can call START and COMPLETE on records assigned
     to them; FLEET_MANAGER can also call START/COMPLETE. Reject others with 403.

3. Create app/api/service-records/route.ts POST for creating a new record
   (FLEET_MANAGER only, status defaults to DUE, dueSince = now, requires
   vehicleId + description).

4. Write Vitest tests for transition() covering: every legal transition,
   at least 3 illegal transitions with the exact rejection message asserted,
   and the completedOdometer-less-than-current rejection.

After this, walk me through, in your own words back to me: what happens
end-to-end, transactionally, when a technician completes a service — every
table that gets touched and in what order. I need to be able to reproduce
this explanation on a call without looking at the code.
```

---

## Module 4 — Technician Assignment

```
Context: Modules 0-3 exist.

Task: Build assignment endpoints, separate from the transition endpoint
(booking sets the *initial* technician as part of BOOK; these endpoints handle
adding/removing technicians afterward, including on records already booked).

- POST /api/service-records/[id]/assignments — FLEET_MANAGER only. Body:
  technicianId. Creates a ServiceAssignment row. Reject if that technician is
  already actively assigned (unassignedAt is null) to this record — return 409.
  Insert a ServiceHistoryEvent type ASSIGNED.
- DELETE /api/service-records/[id]/assignments/[assignmentId] — FLEET_MANAGER
  only. Sets unassignedAt = now (do not hard-delete — we need this in history).
  Insert a ServiceHistoryEvent type UNASSIGNED.
- GET /api/technicians/[id]/service-records — any authenticated user, but if
  the caller is a TECHNICIAN, they may only request their own id (403 otherwise).
  Returns every ServiceRecord (with vehicle info) where this technician has an
  active assignment, across all vehicles. This satisfies "every technician can
  see one list of every record assigned to them."
- Confirm (add a test for this) that PATCH on ServiceRecord's description is
  allowed for an assigned technician but a technician CANNOT hit the assignment
  endpoints above at all, even for their own record — reassignment is
  fleet-manager-only per the brief, full stop.

Write tests: double-assignment rejection, technician trying to assign someone
(403), technician requesting another technician's list (403).
```

---

## Module 5 — Server-Side Search, Filter, Sort, Pagination

```
Context: Modules 0-4 exist.

Task: Build GET /api/service-records as the single list endpoint used by the
whole app (not per-vehicle — "across every vehicle the viewer can see").

Query params, all optional, all handled in the Prisma query itself
(no fetching everything and filtering in JS):
- q — text search over `description` (use Prisma's `contains`, case-insensitive)
- vehicleId — exact match filter
- status — exact match filter (one of the enum values)
- technicianId — filter to records with an ACTIVE ServiceAssignment for that tech
- sortBy — one of: scheduledDate, status, updatedAt (default updatedAt)
- sortDir — asc | desc (default desc)
- page (default 1), pageSize (default 20, max 100)

Response shape:
{ data: ServiceRecord[], total: number, page: number, pageSize: number }

Role behavior: if the caller is a TECHNICIAN, silently constrain results to
records they're actively assigned to, regardless of what technicianId filter
they pass (don't let a technician query someone else's records by manipulating
the filter — this is a server-side authorization concern, not just a UI default).

Use Prisma's `findMany` with `skip`/`take` and a parallel `count` query (or
`$transaction` for both) for `total`.

Write tests: pagination math (total vs returned count), a technician's results
being scoped even when they pass a different technicianId, and text search
matching case-insensitively.
```

---

## Module 6 — Bulk CSV Odometer Import + CSV Export

```
Context: Modules 0-5 exist.

Task: Two endpoints.

1. POST /api/vehicles/bulk-odometer — FLEET_MANAGER only. Accepts a CSV file
   upload (multipart/form-data) with columns: registrationNumber,odometerReading.
   Parse with papaparse or csv-parse. For each row:
   - Look up the vehicle by registrationNumber. If not found, reject that row
     with reason "Vehicle {reg} not found."
   - If odometerReading < vehicle.currentOdometer, reject with reason
     "New reading {n} is lower than current recorded reading {current}."
   - Otherwise update vehicle.currentOdometer and count as success.
   - Valid rows must be applied even if other rows in the same file are
     rejected — process row-by-row, don't wrap the whole file in one
     transaction that rolls back on any failure.
   Return: { results: [{ row: number, registrationNumber, status: 'success'|'rejected', reason?: string }], successCount, rejectedCount }

2. GET /api/service-records/export — any authenticated user (technicians get
   their own scoped set per Module 5's rules, managers get everything, apply
   the same filters as the list endpoint via query params if present).
   Stream back a CSV with columns: vehicleRegistration, vehicleMakeModel,
   description, status, scheduledDate, completedAt. Set
   Content-Type: text/csv and Content-Disposition: attachment.

Write a test for the bulk import: 3 rows where row 2 is a lower reading than
current and should be rejected while rows 1 and 3 succeed — assert the final
DB state reflects exactly that (not all-or-nothing).
```

---

## Module 7 — Dashboard Aggregation

```
Context: Modules 0-6 exist.

Task: GET /api/dashboard — any authenticated user. Single endpoint, several
aggregate queries (use Promise.all to run them concurrently, not sequentially).

Return:
- dueCount: vehicles with an active (non-completed-and-not-yet-due-again)
  DUE service record
- inServiceCount: count of ServiceRecord where status = IN_SERVICE
- completedThisWeek: count of ServiceRecord where status = COMPLETED and
  completedAt falls within the current ISO week
- overdueCount: count of DUE records where dueSince is older than the grace
  period (see Module 9 for where the grace period constant lives — import it,
  don't redefine it here)
- byStatus: count of ServiceRecord grouped by status (use Prisma's `groupBy`)
- byTechnician: for each technician, count of currently-active assignments
  (join through ServiceAssignment where unassignedAt is null)
- completedPerWeek: array of the last 8 ISO weeks with a count of records
  completed in each, oldest first, including weeks with zero (don't just
  skip empty weeks — the frontend chart needs a continuous x-axis)

Write one test asserting completedPerWeek has exactly 8 entries even when
there's only data in 2 of them.
```

---

## Module 8 — Audit Timeline (Read Path)

```
Context: Modules 0-7 exist. ServiceHistoryEvent rows are already being
inserted by Modules 3 and 4.

Task: GET /api/service-records/[id]/timeline — any authenticated user who can
see the record (apply the same technician-scoping as Module 5: a technician
can only fetch the timeline for records they're assigned to; a manager can
fetch any).

Return events oldest-first with actor name/role resolved (not just actorId),
and format each event into a human-readable `summary` string server-side, e.g.:
- CREATED -> "Record created"
- STATUS_CHANGE -> "Status changed from DUE to BOOKED"
- ASSIGNED -> "{actor name} assigned {technician name}" (you'll need to join
  through to know which technician was assigned — if the current schema
  doesn't capture *which* technician on the ASSIGNED event itself, tell me
  now rather than guessing, since I said this table should never be edited
  after the fact and I'd rather fix the schema than patch it later)

Do not add any write/update/delete route for this resource — confirm in your
response that none exists.
```

---

## Module 9 — Overdue Alerts

```
Context: Modules 0-8 exist.

Task:
1. Create lib/overdue.ts exporting a constant GRACE_PERIOD_DAYS (default 7,
   but read from env OVERDUE_GRACE_DAYS if set) and a function
   `isOverdue(record: ServiceRecord): boolean` — true if status is DUE and
   `dueSince` is more than GRACE_PERIOD_DAYS in the past. Use this same
   function in Module 7's overdueCount so the definition lives in one place.

2. GET /api/alerts — any authenticated user. For every vehicle with a DUE
   record where isOverdue() is true, check if an Alert row exists for
   {vehicleId, vehicle.serviceCycle}. If not, create one (triggeredAt = now).
   Return all non-dismissed alerts for the current cycle, with vehicle info
   attached. Include a `count` field for the nav badge.

3. POST /api/alerts/[id]/dismiss — FLEET_MANAGER only. Sets dismissedAt = now,
   dismissedById = caller's id.

4. Confirm the reappearance rule: because Alert has a unique constraint on
   [vehicleId, serviceCycle], and serviceCycle increments every time a service
   completes (Module 3), dismissing an alert for cycle N does nothing to
   suppress a NEW alert being created for cycle N+1 if the vehicle goes overdue
   again. Write a test that: creates a vehicle, drives it to overdue, dismisses
   the alert, completes the service (cycle increments), drives it overdue again
   on the new cycle, and asserts a new non-dismissed Alert exists. This is the
   exact rule from the brief — get this test right before moving on.

After this module, the backend is feature-complete per the 10 goals. Do not
start on frontend work — stop here.
```

---

## After all 9 backend modules

Before touching frontend:
- Run the full Vitest suite, paste me the output.
- Manually exercise the full lifecycle once via curl/Thunder Client: create vehicle → create record → book → start → complete → check dashboard numbers moved → check history timeline reads correctly → force an overdue record → check alert appears → dismiss → complete another cycle → check alert reappears.
- Write `docs/schema.md` and the backend portions of `docs/architecture.md` and `docs/decisions.md` NOW, while it's fresh — not after frontend is done.
