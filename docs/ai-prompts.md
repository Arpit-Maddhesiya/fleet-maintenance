# AI prompts

The prompts actually used, grouped by what they were trying to achieve, with the full prompt text recorded directly here. One produced something wrong; what I corrected is noted under it.

## Backend module build-out (Modules 0–9)

Each module's prompt was pasted in full to the coding agent, then I read the diff, ran the app and the tests before moving on, and committed.

### Module 0 — Schema & Migration


#### Prompt

> Context: Fresh Next.js 15 App Router + TypeScript project with Tailwind already set up. I'm building a fleet maintenance system. Set up Prisma with a Neon Postgres datasource.
>
> Task: Create prisma/schema.prisma with these models and enums exactly as specified below (do not add fields I haven't asked for, and do not remove any — ask me first if something seems missing):
>
> - enum Role: FLEET_MANAGER, TECHNICIAN
> - enum ServiceStatus: DUE, BOOKED, IN_SERVICE, COMPLETED
> - enum HistoryEventType: CREATED, STATUS_CHANGE, ASSIGNED, UNASSIGNED, NOTE
> - User: id, email (unique), passwordHash, name, role, createdAt
> - Vehicle: id, registrationNumber (unique), make, model, currentOdometer, dateIntervalDays, mileageInterval, lastServiceDate, lastServiceOdometer, serviceCycle (int, default 1), archivedAt (nullable), createdAt, updatedAt
> - ServiceRecord: id, vehicleId (FK), description, status (default DUE), scheduledDate (nullable), startedAt (nullable), completedAt (nullable), completedOdometer (nullable), dueSince (default now), createdAt, updatedAt
> - ServiceAssignment: id, serviceRecordId (FK), technicianId (FK to User), assignedAt (default now), unassignedAt (nullable) — an EXPLICIT join model, not an implicit many-to-many, because I need assignment history, not just current state
> - ServiceHistoryEvent: id, serviceRecordId (FK), type, fromStatus (nullable), toStatus (nullable), note (nullable), actorId (FK to User), createdAt — NO updatedAt field, this table must never be updated after insert
> - Alert: id, vehicleId (FK), serviceCycle (int), triggeredAt (default now), dismissedAt (nullable), dismissedById (nullable FK to User). Add a unique constraint on [vehicleId, serviceCycle].
>
> Add indexes on: Vehicle.archivedAt, ServiceRecord.vehicleId, ServiceRecord.status, ServiceRecord.scheduledDate, ServiceRecord.updatedAt, ServiceAssignment.technicianId, ServiceAssignment.serviceRecordId, ServiceHistoryEvent.[serviceRecordId, createdAt], Alert.vehicleId, User.role.
>
> Also: set up .env with DATABASE_URL (pooled, for the app) and DIRECT_URL (direct, for migrations) — explain the difference in a comment. Run `npx prisma migrate dev --name init` and show me the output. Do not write any application code yet — schema and migration only.
>
> After this, tell me in plain language: which relationships are one-to-many vs many-to-many in this schema, and why ServiceAssignment is a real table instead of an implicit relation. I need to be able to repeat this explanation myself later.

#### What I got

The schema, migration, env setup, and a clear explanation: every relationship here is one-to-many (Vehicle→ServiceRecord, ServiceRecord→ServiceAssignment, etc.); there is no many-to-many. ServiceAssignment is an explicit join table because the brief needs assignment *history* — an implicit many-to-many can only represent the current state, while a row with `unassignedAt` records who was assigned when and when they were removed.

### Module 1 — Auth & Role Enforcement

#### Prompt

> Context: Prisma schema from Module 0 already exists and is migrated. Next.js 15 App Router project.
>
> Task: Set up Auth.js v5 (next-auth@beta) with a Credentials provider (email + password, bcrypt-hashed) backed by the existing User model.
>
> Requirements:
> 1. Install and configure next-auth v5 with the Prisma adapter, using JWT session strategy (not database sessions — explain why in a comment: fewer moving parts for a project this size, at the cost of not being able to instantly revoke a session).
> 2. Session's JWT and session object must include the user's `role` and `id` — not just email/name.
> 3. Create a `lib/auth.ts` exporting `auth()`, `signIn`, `signOut`, and a helper `requireRole(role: Role)` that I can call at the top of any route handler or server action. It should throw a typed error (e.g. ForbiddenError) if the session's role doesn't match, and return the session if it does.
> 4. Add middleware.ts that redirects unauthenticated requests away from any route under /dashboard, /vehicles, /records to /login.
> 5. IMPORTANT: role checks must happen in route handlers / server actions, not only in middleware or the UI. Middleware here is just a redirect convenience for logged-out users — it is not the authorization boundary. Every mutating route handler for fleet-manager-only actions must call requireRole('FLEET_MANAGER') itself.
> 6. Create prisma/seed.ts that creates: one FLEET_MANAGER user (manager@fleet.test / password123), two TECHNICIAN users (tech1@fleet.test and tech2@fleet.test, same password). Hash passwords with bcrypt before inserting. Wire this into package.json's prisma.seed config so `npx prisma db seed` works.
> 7. Build a minimal /login page (server action based, not client-fetch) using the existing Tailwind setup — just functional, no styling polish yet.
>
> After this, show me the exact code path a request takes when a TECHNICIAN tries to hit a fleet-manager-only route handler, from request to 403, so I can trace it myself.

#### What I got

Auth.js v5 with Credentials provider, JWT strategy, role/id carried in the JWT and session. `lib/auth.ts` exports `auth()`, `signIn`, `signOut`, and `requireRole()` throwing typed `UnauthenticatedError`/`ForbiddenError`. Seed script wired through `prisma.config.ts` (this project uses Prisma 7, so the seed hook lives there rather than package.json's `prisma.seed`). Login page with a server action. The trace: request → proxy redirect convenience (logged-out only) → route handler calls `requireRole('FLEET_MANAGER')` → session role is TECHNICIAN → `ForbiddenError` → 403 JSON.

One deviation worth noting: the module says "middleware.ts", but this project is on Next.js 16, which renamed it to `proxy.ts` with a `proxy()` export. The file is `src/proxy.ts` and Next registers it as "Proxy (Middleware)" in the build output.

### Module 2 — Vehicles CRUD + Archive/Restore

#### Prompt

> Context: Modules 0-1 exist (schema + auth with requireRole helper).
>
> Task: Build the Vehicles resource as Next.js route handlers under app/api/vehicles/.
>
> Endpoints:
> - POST /api/vehicles — FLEET_MANAGER only. Body: registrationNumber, make, model, currentOdometer, dateIntervalDays, mileageInterval. Validate with Zod (all required, currentOdometer/dateIntervalDays/mileageInterval must be positive integers, registrationNumber non-empty). On create, set lastServiceDate = now, lastServiceOdometer = currentOdometer, serviceCycle = 1.
> - GET /api/vehicles — any authenticated user. Returns non-archived vehicles by default; accept ?includeArchived=true. No pagination needed here (small list, unlike service records later).
> - GET /api/vehicles/[id] — any authenticated user. Include its serviceRecords (most recent first) in the response — this is "opening a vehicle shows its service history" from the brief.
> - PATCH /api/vehicles/[id] — FLEET_MANAGER only. Can update make, model, dateIntervalDays, mileageInterval. Do NOT allow currentOdometer to be edited here — that's a separate concern (bulk update + possibly a dedicated reading-update endpoint later), and don't allow lowering it if you do add a path for it.
> - POST /api/vehicles/[id]/archive — FLEET_MANAGER only. Sets archivedAt = now. Does not touch service records.
> - POST /api/vehicles/[id]/restore — FLEET_MANAGER only. Sets archivedAt = null.
>
> Every route: use requireRole/auth() from lib/auth.ts, return proper HTTP status codes (401 unauthenticated, 403 wrong role, 404 not found, 400 validation error with the Zod error details, 409 for unique constraint violation on registrationNumber), and use a shared Zod schema file (lib/validation/vehicle.ts) rather than inlining schemas per route.
>
> Write 3-4 Vitest tests: one for the archive/restore round trip, one for a technician being rejected on POST, one for the Zod validation rejecting a negative mileageInterval.
>
> Explain in a comment at the top of the vehicles route file: why archived vehicles aren't deleted, and what "removes from default fleet view without destroying history" implies about how GET should filter.

#### What I got

All six endpoints with the exact role rules, shared Zod schemas in `lib/validation/vehicle.ts`, and the P2002 unique-violation mapped to a 409. The comment explains the archive decision: deleting a vehicle would orphan its service history, so archiving only hides it from the default fleet view (`archivedAt: null` filter) while keeping the record for history. Tests cover archive/restore round trip, technician POST rejection, and Zod rejection of a negative mileageInterval.

### Module 3 — Service Lifecycle State Machine

#### Prompt

> Context: Modules 0-2 exist. This is the core domain logic of the whole app — go slow and be precise here.
>
> Task: Build the ServiceRecord lifecycle as its own testable module, separate from the route handlers that call it.
>
> 1. Create lib/service-lifecycle.ts with a pure function: `transition(record: ServiceRecord, action: TransitionAction, payload): TransitionResult` where TransitionAction is one of: BOOK, START, COMPLETE, and TransitionResult is either `{ ok: true, patch: Partial<ServiceRecord> }` or `{ ok: false, reason: string }`.
>
>    Rules to encode exactly:
>    - DUE -> BOOKED via BOOK: requires payload.scheduledDate and payload.technicianId (at least one technician). Reject any other current status with a clear message like "Cannot book a record that is already {status}."
>    - BOOKED -> IN_SERVICE via START: no extra payload needed. Reject from any other status.
>    - IN_SERVICE -> COMPLETED via COMPLETE: requires payload.completedOdometer (must be >= vehicle.currentOdometer, reject with reason if not). On success, the patch must include completedAt = now and completedOdometer.
>    - Any other requested transition (e.g. DUE -> IN_SERVICE directly, or COMPLETED -> anything) must return ok:false with a message naming the illegal transition explicitly, e.g. "Cannot move from COMPLETED to BOOKED."
>    - This function does NOT touch the database. It's pure so it's trivially testable and so the rules live in exactly one place.
>
> 2. Create app/api/service-records/[id]/transition/route.ts (POST) that:
>    - Loads the record + its vehicle in a transaction
>    - Calls transition()
>    - If ok:false, returns 409 with `{ error: reason }`
>    - If ok:true and action === COMPLETE: within the SAME transaction, also update the Vehicle: currentOdometer = completedOdometer, lastServiceDate = now, lastServiceOdometer = completedOdometer, serviceCycle = serviceCycle + 1. This is the "completing a service resets both counters" rule — it must be atomic with the record update, not two separate writes that could partially fail.
>    - Also within the same transaction, insert a ServiceHistoryEvent of type STATUS_CHANGE with fromStatus/toStatus/actorId set.
>    - Only FLEET_MANAGER can call BOOK (assigns technician + schedules). Any assigned technician can call START and COMPLETE on records assigned to them; FLEET_MANAGER can also call START/COMPLETE. Reject others with 403.
>
> 3. Create app/api/service-records/route.ts POST for creating a new record (FLEET_MANAGER only, status defaults to DUE, dueSince = now, requires vehicleId + description).
>
> 4. Write Vitest tests for transition() covering: every legal transition, at least 3 illegal transitions with the exact rejection message asserted, and the completedOdometer-less-than-current rejection.
>
> After this, walk me through, in your own words back to me: what happens end-to-end, transactionally, when a technician completes a service — every table that gets touched and in what order. I need to be able to reproduce this explanation on a call without looking at the code.

#### What I got

A pure `transition()` in `lib/service-lifecycle.ts` with exactly the encoded rules, a transition route that runs everything in one `$transaction` (record update → vehicle counter reset on COMPLETE → history event), and a POST create route. The end-to-end walkthrough: completing a service touches ServiceRecord (status → COMPLETED, completedAt, completedOdometer), Vehicle (currentOdometer/lastServiceDate/lastServiceOdometer advanced, serviceCycle incremented), and ServiceHistoryEvent (STATUS_CHANGE with from/to/actor) — all in one transaction so a failure rolls back all three.

### Module 4 — Technician Assignment

#### Prompt

> Context: Modules 0-3 exist.
>
> Task: Build assignment endpoints, separate from the transition endpoint (booking sets the *initial* technician as part of BOOK; these endpoints handle adding/removing technicians afterward, including on records already booked).
>
> - POST /api/service-records/[id]/assignments — FLEET_MANAGER only. Body: technicianId. Creates a ServiceAssignment row. Reject if that technician is already actively assigned (unassignedAt is null) to this record — return 409. Insert a ServiceHistoryEvent type ASSIGNED.
> - DELETE /api/service-records/[id]/assignments/[assignmentId] — FLEET_MANAGER only. Sets unassignedAt = now (do not hard-delete — we need this in history). Insert a ServiceHistoryEvent type UNASSIGNED.
> - GET /api/technicians/[id]/service-records — any authenticated user, but if the caller is a TECHNICIAN, they may only request their own id (403 otherwise). Returns every ServiceRecord (with vehicle info) where this technician has an active assignment, across all vehicles. This satisfies "every technician can see one list of every record assigned to them."
> - Confirm (add a test for this) that PATCH on ServiceRecord's description is allowed for an assigned technician but a technician CANNOT hit the assignment endpoints above at all, even for their own record — reassignment is fleet-manager-only per the brief, full stop.
>
> Write tests: double-assignment rejection, technician trying to assign someone (403), technician requesting another technician's list (403).

#### What I got

POST/DELETE assignment endpoints (manager-only, 409 on double-assign, soft-remove with `unassignedAt`), the technician-scoped list endpoint, and history events on both add and remove. Tests cover the double-assignment rejection, a technician hitting the assignment endpoints (403), a technician requesting another technician's list (403), and the description PATCH being allowed for an assigned technician.

### Module 5 — Server-Side Search, Filter, Sort, Pagination

#### Prompt

> Context: Modules 0-4 exist.
>
> Task: Build GET /api/service-records as the single list endpoint used by the whole app (not per-vehicle — "across every vehicle the viewer can see").
>
> Query params, all optional, all handled in the Prisma query itself (no fetching everything and filtering in JS):
> - q — text search over `description` (use Prisma's `contains`, case-insensitive)
> - vehicleId — exact match filter
> - status — exact match filter (one of the enum values)
> - technicianId — filter to records with an ACTIVE ServiceAssignment for that tech
> - sortBy — one of: scheduledDate, status, updatedAt (default updatedAt)
> - sortDir — asc | desc (default desc)
> - page (default 1), pageSize (default 20, max 100)
>
> Response shape: `{ data: ServiceRecord[], total: number, page: number, pageSize: number }`
>
> Role behavior: if the caller is a TECHNICIAN, silently constrain results to records they're actively assigned to, regardless of what technicianId filter they pass (don't let a technician query someone else's records by manipulating the filter — this is a server-side authorization concern, not just a UI default).
>
> Use Prisma's `findMany` with `skip`/`take` and a parallel `count` query (or `$transaction` for both) for `total`.
>
> Write tests: pagination math (total vs returned count), a technician's results being scoped even when they pass a different technicianId, and text search matching case-insensitively.

#### What I got

A single list endpoint with every param expressed in the Prisma query (`skip`/`take` + parallel `count`), a validated query schema, and the key authorization rule: a TECHNICIAN's `technicianId` filter is overridden with their own id so they can never query someone else's records. Tests cover pagination math, technician scoping despite a foreign technicianId, and case-insensitive search.

### Module 6 — Bulk CSV Odometer Import + CSV Export

#### Prompt

> Context: Modules 0-5 exist.
>
> Task: Two endpoints.
>
> 1. POST /api/vehicles/bulk-odometer — FLEET_MANAGER only. Accepts a CSV file upload (multipart/form-data) with columns: registrationNumber,odometerReading. Parse with papaparse or csv-parse. For each row:
>    - Look up the vehicle by registrationNumber. If not found, reject that row with reason "Vehicle {reg} not found."
>    - If odometerReading < vehicle.currentOdometer, reject with reason "New reading {n} is lower than current recorded reading {current}."
>    - Otherwise update vehicle.currentOdometer and count as success.
>    - Valid rows must be applied even if other rows in the same file are rejected — process row-by-row, don't wrap the whole file in one transaction that rolls back on any failure.
>    Return: `{ results: [{ row: number, registrationNumber, status: 'success'|'rejected', reason?: string }], successCount, rejectedCount }`
>
> 2. GET /api/service-records/export — any authenticated user (technicians get their own scoped set per Module 5's rules, managers get everything, apply the same filters as the list endpoint via query params if present). Stream back a CSV with columns: vehicleRegistration, vehicleMakeModel, description, status, scheduledDate, completedAt. Set Content-Type: text/csv and Content-Disposition: attachment.
>
> Write a test for the bulk import: 3 rows where row 2 is a lower reading than current and should be rejected while rows 1 and 3 succeed — assert the final DB state reflects exactly that (not all-or-nothing).

#### What I got

The bulk upload parses with papaparse, processes rows one at a time (a bad row never rolls back the good ones), and returns the per-row report with the exact rejection reasons. The export applies the same filters + technician scoping as the list endpoint and streams back the CSV with the required headers. Test: 3-row file with the middle row rejected, asserting only rows 1 and 3 land in the DB.

### Module 7 — Dashboard Aggregation

#### Prompt

> Context: Modules 0-6 exist.
>
> Task: GET /api/dashboard — any authenticated user. Single endpoint, several aggregate queries (use Promise.all to run them concurrently, not sequentially).
>
> Return:
> - dueCount: vehicles with an active (non-completed-and-not-yet-due-again) DUE service record
> - inServiceCount: count of ServiceRecord where status = IN_SERVICE
> - completedThisWeek: count of ServiceRecord where status = COMPLETED and completedAt falls within the current ISO week
> - overdueCount: count of DUE records where dueSince is older than the grace period (see Module 9 for where the grace period constant lives — import it, don't redefine it here)
> - byStatus: count of ServiceRecord grouped by status (use Prisma's `groupBy`)
> - byTechnician: for each technician, count of currently-active assignments (join through ServiceAssignment where unassignedAt is null)
> - completedPerWeek: array of the last 8 ISO weeks with a count of records completed in each, oldest first, including weeks with zero (don't just skip empty weeks — the frontend chart needs a continuous x-axis)
>
> Write one test asserting completedPerWeek has exactly 8 entries even when there's only data in 2 of them.

#### What I got

A single dashboard endpoint running all aggregates concurrently with `Promise.all`, `groupBy` for status and technician, and a zero-filled 8-week `completedPerWeek` (ISO weeks, Monday-based, computed in UTC). Test asserts exactly 8 entries with only 2 weeks of data.

### Module 8 — Audit Timeline (Read Path)

#### Prompt

> Context: Modules 0-7 exist. ServiceHistoryEvent rows are already being inserted by Modules 3 and 4.
>
> Task: GET /api/service-records/[id]/timeline — any authenticated user who can see the record (apply the same technician-scoping as Module 5: a technician can only fetch the timeline for records they're assigned to; a manager can fetch any).
>
> Return events oldest-first with actor name/role resolved (not just actorId), and format each event into a human-readable `summary` string server-side, e.g.:
> - CREATED -> "Record created"
> - STATUS_CHANGE -> "Status changed from DUE to BOOKED"
> - ASSIGNED -> "{actor name} assigned {technician name}" (you'll need to join through to know which technician was assigned — if the current schema doesn't capture *which* technician on the ASSIGNED event itself, tell me now rather than guessing, since I said this table should never be edited after the fact and I'd rather fix the schema than patch it later)
>
> Do not add any write/update/delete route for this resource — confirm in your response that none exists.

#### What I got

A read-only timeline endpoint (no write/update/delete routes exist anywhere near it) with technician scoping identical to Module 5, events oldest-first, actor name/role joined, and server-side `summary` strings. The schema question surfaced honestly: `ServiceHistoryEvent` was missing a field for *which* technician an ASSIGNED/UNASSIGNED event referred to. Rather than guess at write time, I added a nullable `technicianId` relation on the event itself (captured at insert in Modules 3/4) so the summary can name the technician without reconstructing history later.

### Module 9 — Overdue Alerts

#### Prompt

> Context: Modules 0-8 exist.
>
> Task:
> 1. Create lib/overdue.ts exporting a constant GRACE_PERIOD_DAYS (default 7, but read from env OVERDUE_GRACE_DAYS if set) and a function `isOverdue(record: ServiceRecord): boolean` — true if status is DUE and `dueSince` is more than GRACE_PERIOD_DAYS in the past. Use this same function in Module 7's overdueCount so the definition lives in one place.
>
> 2. GET /api/alerts — any authenticated user. For every vehicle with a DUE record where isOverdue() is true, check if an Alert row exists for {vehicleId, vehicle.serviceCycle}. If not, create one (triggeredAt = now). Return all non-dismissed alerts for the current cycle, with vehicle info attached. Include a `count` field for the nav badge.
>
> 3. POST /api/alerts/[id]/dismiss — FLEET_MANAGER only. Sets dismissedAt = now, dismissedById = caller's id.
>
> 4. Confirm the reappearance rule: because Alert has a unique constraint on [vehicleId, serviceCycle], and serviceCycle increments every time a service completes (Module 3), dismissing an alert for cycle N does nothing to suppress a NEW alert being created for cycle N+1 if the vehicle goes overdue again. Write a test that: creates a vehicle, drives it to overdue, dismisses the alert, completes the service (cycle increments), drives it overdue again on the new cycle, and asserts a new non-dismissed Alert exists. This is the exact rule from the brief — get this test right before moving on.
>
> After this module, the backend is feature-complete per the 10 goals. Do not start on frontend work — stop here.

#### What I got

`lib/overdue.ts` with `GRACE_PERIOD_DAYS` (env-overridable) and `isOverdue()`, reused by the dashboard so the definition lives in one place. `GET /api/alerts` lazily creates Alert rows for every currently-overdue vehicle/cycle using `createMany(skipDuplicates: true)` — relying on the unique constraint rather than a racy find-then-create — and returns only current-cycle, non-dismissed alerts with a `count`. Dismiss stamps `dismissedAt`/`dismissedById`, manager-only. The reappearance test drives the full cycle and passes.

#### What I corrected

Several things, each caught by reading the diff and running tests:
- The alerts route originally used a manual "check if alert exists, then create" (`findFirst` then `create`) instead of `createMany(..., skipDuplicates: true)`. That's a race and it re-implements what the unique constraint already guarantees. I rewrote it to rely on the constraint, which is also what makes the reappearance rule correct.
- My first version of the reappearance test used a hand-rolled `mockImplementation` whose parameter types didn't match Prisma's strict delegate types — `tsc` failed. I fixed it by casting the implementations, the same way the existing tests handle mock values.
- The dashboard's `overdueCount` originally kept its own `dueSince < now - grace` query even after `isOverdue()` existed. The module plan says the definition must live in one place, so I changed it to fetch DUE records and count with `isOverdue()`.

## Debugging the manual lifecycle pass

### Prompt

> Run the full lifecycle manually: create vehicle → create record → book → start → complete → check dashboard → check timeline → force overdue → check alert → dismiss → complete another cycle → check alert reappears. Use curl against the dev server.

### What I got

The full flow verified end-to-end against the real Neon database — cycle incremented, dashboard numbers moved, timeline correct, alert created/dismissed, and a brand-new alert reappeared on the next cycle. Also surfaced a real environment finding: a pre-existing dev server on port 3000 was serving stale routes (404 on `/api/auth/*`), which is why the first curl pass failed. The fix was running my own server on a separate port — no code change needed.

### What I corrected

The first sign-in attempt used a fake `csrfToken` and got a 404; the real flow needs a token from `GET /api/auth/csrf` first. Also, a `node -e` one-liner to backdate `dueSince` failed on shell escaping and on the generated client being TS-only — I switched to a `tsx` script in the project root (deleted afterward).

## Documentation

### Prompt

> Write `docs/schema.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/plan.md`, and the backend portions of `docs/ai-prompts.md`, answering each file's stub questions based on the actual code.

### What I got

All five docs filled in from the real schema, routes, and decisions, including one reversed decision (the grace-period duplication) and the 100x-data weak points.

## Frontend module build-out (Modules F0–F8)

Same process as the backend: each module's prompt was pasted in full to the coding agent, then I read the diff, ran the app and tests before moving on, and committed. The two rules from the frontend brief held throughout: hiding buttons is cosmetic (the server's `requireRole` is the real boundary — verified by curl later in I0), and every list/table is server-driven from the Module 5 endpoint, never a client-side `.filter()` over a fully-fetched array.

### Module F0 — App Shell, Auth Pages, Role-Aware Nav

#### Prompt

> Context: Backend from Modules 0-9 is complete and working (auth, vehicles, service records, assignments, search, bulk CSV, dashboard, timeline, alerts). Next.js 15 App Router + Tailwind is set up. I want shadcn/ui for base components.
>
> Task:
> 1. Install and initialize shadcn/ui (button, input, table, dialog, dropdown-menu, badge, card, select, tabs, toast/sonner components at minimum).
> 2. Build app/login/page.tsx as a server component with a form posting to the existing Auth.js credentials sign-in action. Show a clear error message on bad credentials (don't just redirect silently).
> 3. Build a root authenticated layout (app/(app)/layout.tsx) with:
>    - A left sidebar or top nav with links: Dashboard, Vehicles, Service Records, My Records (technician only), Alerts (with a count badge — fetch from GET /api/alerts and show the count; poll or refetch on navigation, no need for websockets).
>    - The nav must read the session role and conditionally show/hide manager-only links (Vehicles create, bulk import) — but comment clearly that this is cosmetic, the backend already enforces the real boundary.
>    - A sign-out button.
> 4. Add a lib/api-client.ts with a small typed fetch wrapper (base function that adds credentials, parses JSON, and throws a typed ApiError with the status code and server-provided message on non-2xx) so every page/component below uses one consistent way to call the backend instead of raw fetch calls copy-pasted everywhere.
> 5. Set up a toast provider (sonner) at the layout level so any page can call `toast.error(...)` / `toast.success(...)` for API results.
>
> Do not build any feature pages yet (no vehicles list, no dashboard content) — just the shell, auth, nav, and the shared api-client. Stub each nav destination with a one-line placeholder page so the nav is clickable.

#### What I got

The shell landed with shadcn/ui components under `src/components/ui/`, a `SessionProvider`-wrapped authenticated layout in `src/app/(app)/layout.tsx` that redirects logged-out visitors to `/login`, and a role-aware `AppNav` that shows Vehicles/Service Records/Alerts to managers and My Records to technicians. `src/lib/api-client.ts` is exactly the shared typed wrapper the brief asked for: it sends `credentials: "include"`, parses JSON, and throws `ApiError` (status + the server's `{ error }` message + parsed body for field details) on non-2xx — every page uses it. The login flow got a real error state for bad credentials instead of a silent redirect.

One deliberate deviation I made: `RoleRestrictedPage` in `src/lib/role-restricted-page.tsx` wraps whole pages (Vehicles, Service Records, the detail page) so a technician hitting `/vehicles` by direct URL is bounced to their dashboard rather than seeing a manager page with buttons. The wrapper and the nav are both commented as cosmetic — the 403 still comes from the server if the same page's API is called directly.

#### What I corrected

The initial version put `"use client"` on the whole app shell including server-only session logic, which fights the App Router's RSC model. I split it: the layout stays a server component that calls `auth()` for the redirect and mounts client providers; the nav is its own client component that reads the session via `useSession()`.

### Module F1 — Vehicles: List, Create/Edit, Archive/Restore, Detail

#### Prompt

> Context: Module F0 shell/nav/api-client exists. Backend vehicle endpoints from backend Module 2 are live.
>
> Task:
> 1. app/(app)/vehicles/page.tsx — table of vehicles (registration, make/model, current odometer, date interval, mileage interval, status badge Active/Archived) fetched via lib/api-client from GET /api/vehicles. Toggle to show archived. FLEET_MANAGER sees an "Add Vehicle" button; technicians don't (cosmetic-only per F0's note).
> 2. A create/edit dialog (shadcn Dialog + form) with client-side validation mirroring the Zod schema (don't duplicate the schema by hand — either share the Zod schema from the backend via a shared package/import if your project structure allows it, or at minimum keep the rules identical and comment that they must stay in sync). On submit, call the api-client, show a toast on success/failure, refresh the list.
> 3. Archive/Restore as row actions with a confirmation dialog before archiving (don't let one misclick nuke a vehicle from the default view without warning).
> 4. app/(app)/vehicles/[id]/page.tsx — vehicle detail: its core info, current status (due/overdue/ok — compute display-side using the same interval logic the backend uses, or better, just show whatever the backend already tells you if backend Module 7/9 exposes a per-vehicle due status; don't reimplement overdue logic in the frontend if the backend already computed it), and below that its full service history list.
>
> Handle loading and empty states explicitly (skeleton or spinner while fetching, a real empty-state message for zero vehicles, not a blank table).

#### What I got

The vehicles table with an archived toggle, a manager-only Add Vehicle button, and an explicit empty state; a `VehicleDialog` used for both create and edit; an `ArchiveAction` component that puts a confirmation dialog in front of archiving; and the vehicle detail page showing core info plus the full service history from `GET /api/vehicles/[id]`. The list gained a client-side search box over registration/make/model (this stays client-side deliberately — the vehicle endpoint is a small unpaginated fleet list, unlike service records). Loading shows skeletons rather than a flash of empty table.

The one judgment call I made against the letter of the prompt: rather than reimplementing due/overdue status math on the client or building a per-vehicle status endpoint, the vehicle rows and detail page show the concrete, DB-backed signal — the next service record's status (and "X days overdue" where a DUE record is past the grace period, using the same `isOverdue` semantics the backend uses). The intervals that *predict* the next due date are shown as data, not re-derived into a fake status. No duplicated rule logic.

#### What I corrected

Client-side validation rules were initially hand-written to "match" the Zod schema, which is exactly the drift risk the prompt flagged. I kept the field-level rules (required, positive integers) in the dialog but made the server's Zod error the authority: on a 400 the dialog renders the field errors from the API response (`fieldErrorsOf` in the api-client) inline, and the local checks are only a fast first gate. The comment in the dialog says they must stay in sync — but correctness comes from the server either way.

### Module F2 — Service Records: Server-Driven List (Search/Filter/Sort/Pagination)

#### Prompt

> Context: Modules F0-F1 exist. Backend search endpoint from backend Module 5 is live at GET /api/service-records.
>
> Task: app/(app)/service-records/page.tsx.
>
> Requirements:
> - Controls: text search input (debounced ~300ms before firing a request), vehicle filter (select, populated from GET /api/vehicles), status filter (select from the 4 enum values + "All"), technician filter (select, manager-only — a technician's view is implicitly scoped server-side so don't even show this control to a technician), sort dropdown (scheduledDate/status/updatedAt) with asc/desc toggle, and pagination controls (prev/next + page numbers, showing "X-Y of Z" using the `total` from the response).
> - CRITICAL: every one of these controls must update the URL's query params (use useSearchParams/router.push with shallow routing) and refetch from the server with those params — do not fetch once and filter client-side. This also gives you shareable/bookmarkable filtered URLs for free, which is a nice thing to point out if asked why you did it this way.
> - Table columns: vehicle registration, description (truncated with a tooltip for the full text), status (as a colored badge), scheduled date, last updated, assigned technicians (comma list or avatar stack).
> - Row click navigates to app/(app)/service-records/[id]/page.tsx (build this as a stub for now — full detail comes in Module F3).
> - FLEET_MANAGER sees a "New Record" button opening a create dialog (pick vehicle, enter description) posting to POST /api/service-records.
>
> Add a loading skeleton for the table specifically (not a full-page spinner — the filters/controls should stay usable while a new page of results loads).

#### What I got

The single most important page in the app, and it follows the brief exactly: the URL query string is the source of truth for every control (`q`, `vehicleId`, `status`, `technicianId`, `sortBy`, `sortDir`, `page`), and every control rewrites the URL (`router.push`) and refetches — nothing is filtered client-side. Search is debounced ~300 ms, the filters/selects stay live above a table-only skeleton while a page loads, and the pagination footer shows "X–Y of Z" from the server's `total`. The table lives in a reusable `ServiceRecordsTable` component (shared later by My Records) with truncated description + full-text tooltip, colored status badges that pair text with color, and assigned-technician names.

Two extras that made it past the base spec because they were cheap and the backend already supported them: an "Overdue" status option in the filter dropdown (a DUE record past the grace period, expressed as its own `overdue=true` param rather than faking a status enum value the API doesn't know), and an "Export CSV" button wired to `GET /api/service-records/export` that carries the page's current filters into the export URL. The `ExportButton` triggers a browser download directly (the app is same-origin, so a plain GET carries the session cookie).

#### What I corrected

My first pass fetched the technician dropdown from the backend technicians endpoint only when the manager filter was opened, which made the filter control pop in late. It now loads the technician/vehicle lists once on mount and keeps them in state, so the selects render immediately. Also — the export button initially built a `Blob` + anchor download; since the app is same-origin there was no need, and navigating straight to the export URL with credentials is simpler and streams server-side. The button now just navigates.

### Module F3 — Service Record Detail: Lifecycle Actions + Assignment Management

#### Prompt

> Context: Modules F0-F2 exist. Backend Modules 3 (lifecycle) and 4 (assignment) are live.
>
> Task: Build out app/(app)/service-records/[id]/page.tsx fully.
>
> Sections:
> 1. Header: vehicle info, description (editable inline by the assigned technician or a manager — PATCH to update description only, per the brief's rule that assignment can't be changed this way), current status as a large badge.
> 2. Lifecycle action button(s), contextual to current status and the viewer's role:
>    - DUE + FLEET_MANAGER: "Book Service" button opens a dialog to pick a scheduled date and at least one technician (multi-select), POSTs to the transition endpoint with action=BOOK.
>    - BOOKED + (assigned technician or manager): "Start Service" button, action=START, probably no dialog needed (confirm then call).
>    - IN_SERVICE + (assigned technician or manager): "Complete Service" button opens a dialog asking for the final odometer reading, action=COMPLETE. Client-side check that it's >= vehicle's currentOdometer before even submitting (nicer UX), but the real validation is server-side — if the server rejects it, surface the exact server message in a toast, don't invent your own.
>    - On any transition attempt the server rejects (409), show the server's exact reason string to the user.
> 3. Assignments panel (FLEET_MANAGER only for add/remove; everyone sees the current list): list of currently active technician assignments with a remove (X) button per row calling DELETE on the assignment; an "Assign Technician" select + button calling POST.
> 4. Timeline panel: fetch from GET /api/service-records/[id]/timeline (backend Module 8) and render as a vertical activity feed using the server-provided `summary` strings, oldest at top or bottom — pick one and be consistent (I'd suggest newest-first so the most relevant recent activity is visible without scrolling). No edit/delete affordances anywhere near this panel — it's read-only by design.
>
> Make sure every action button's disabled/hidden logic is correct for role + status combinations you haven't explicitly coded for (e.g., a technician not assigned to this record viewing it — they should see it if they got here via "My Records" but should NOT see action buttons for other technicians' records unless they're assigned).

#### What I got

The full detail page: a header with vehicle info, description and status badge; contextual lifecycle actions (Book dialog with scheduled date + technician multi-select for DUE records, one-click Start for BOOKED, Complete dialog with the final odometer for IN_SERVICE); an assignments panel where managers add/remove technicians and everyone sees the current list; and a newest-first vertical timeline rendered from the server's `summary` strings with no edit affordances anywhere. The button-visibility logic is role + status + *assignment* aware: a technician who somehow lands on a record they aren't assigned to sees the record read-only with no lifecycle buttons, and the 403 handling is graceful if a stale button ever slips through. Server rejection reasons — the state machine's "Cannot move from X to Y" strings — reach the screen via toast verbatim; 400s from the description PATCH render inline field errors.

#### What I corrected

The lifecycle buttons were originally hidden entirely based on role, which meant an assigned technician never saw Start/Complete. The correct rule is that the *record's assignment* is what grants START/COMPLETE — a manager is always allowed, but a technician's button depends on whether *they* are an active assignee, not just on their role. I fixed the conditions to check the current user's id against the active assignments list before rendering an action button.

### Module F4 — "My Records" (Technician View)

#### Prompt

> Context: Modules F0-F3 exist. Backend endpoint from backend Module 4 (GET /api/technicians/[id]/service-records) is live.
>
> Task: app/(app)/my-records/page.tsx, technician-facing (still viewable by a manager for their own curiosity if you want, but the meaningful use case is technicians). Reuse the service-record row/table component from Module F2 if you built it as a reusable component (you should have — if you didn't, refactor it out now rather than duplicating the table markup).
>
> This page calls the technician-scoped endpoint directly rather than the general list endpoint with a technicianId filter, matching how the backend is actually structured. No filters needed beyond maybe a status filter — this list is already scoped to "assigned to me," it doesn't need vehicle/technician filters.

#### What I got

`/my-records` fetches the caller's own active assignments from `GET /api/technicians/[id]/service-records` (the technician's own id — the backend 403s anyone else), reusing the same `ServiceRecordsTable` from F2 rather than duplicating the markup. It has just a status filter plus the table's own states, and row clicks go to the shared record detail. A manager opening the page sees their own (empty) assignment list, which matches the backend's self-only scoping.

#### What I corrected

Nothing agent-side worth recording — the module went in cleanly because the reusable table and the self-scoped endpoint already existed. The one post-hoc change (from the polish pass) was making the empty state for a technician with no active assignments read as "nothing assigned right now" rather than looking like an error.

### Module F5 — Bulk CSV Odometer Upload + Service History Export

#### Prompt

> Context: Modules F0-F4 exist. Backend Module 6 endpoints are live.
>
> Task:
> 1. A "Bulk Update Odometer" page or dialog (manager-only), accessible from the Vehicles page. File input accepting .csv, a short inline example of the expected format (registrationNumber,odometerReading) so a user isn't guessing. On submit, POST the file as multipart/form-data to /api/vehicles/bulk-odometer.
> 2. Render the per-row result report the backend returns as a table: row number, registration, status (success/rejected badge), reason if rejected. Show a summary line ("12 succeeded, 3 rejected") above the table. This report should stay on screen after submission — don't auto-dismiss it, the whole point is the user needs to see which rows failed and why.
> 3. An "Export Service History" button (visible on the Service Records list page) that calls GET /api/service-records/export with whatever filters are currently active in the URL, and triggers a browser download of the returned CSV.

#### What I got

A manager-only "Bulk Update Odometer" dialog on the Vehicles page with a file input, an inline example of the expected two-column format, and a `FormData` POST through the api-client's `formData` path. After submission the dialog stays open and renders the per-row report (row number, registration, success/rejected badge, rejection reason) above a "X succeeded, Y rejected" summary — deliberately not auto-dismissed. The export button on the Service Records page downloads the CSV for whatever filters are currently in the URL.

#### What I corrected

The first version parsed and validated the CSV client-side before uploading, which duplicated backend logic and would have let a "valid-looking" file through that the server still rejects row-by-row. The client now does no parsing at all — it sends the raw file and renders whatever the server's report says. The server is the only place the file format is defined.

### Module F6 — Dashboard

#### Prompt

> Context: Modules F0-F5 exist. Backend Module 7 (GET /api/dashboard) is live.
>
> Task: app/(app)/dashboard/page.tsx, the landing page after login.
>
> Layout:
> - Four headline stat cards across the top: Due for Service, In Service, Completed This Week, Overdue (make the Overdue card visually distinct — it's the one that matters most operationally, e.g. a red/amber accent). Each stat card, when clicked, could deep-link to the service-records list pre-filtered to that status (nice touch, not required — do it if it's cheap).
> - A breakdown section: status distribution (simple bar or donut using Recharts, fed by dashboard's byStatus) and a per-technician workload list or bar chart (byTechnician).
> - A line or bar chart of completedPerWeek across the last 8 weeks (Recharts), x-axis = week label, y-axis = count. Confirm it renders 8 points even for weeks with zero completions.
>
> Make this the default route for '/' after login (redirect from '/' to '/dashboard' for authenticated users).

#### What I got

The dashboard with the four KPI cards (Overdue visually distinct), a Recharts status-distribution chart and per-technician workload view fed by `byStatus`/`byTechnician`, and an 8-week completions bar chart that renders all eight points including zero weeks. KPI cards deep-link to the service-records list pre-filtered to that status. `/` redirects to `/dashboard` for authenticated users (and to `/login` otherwise). Charts use theme-aware colors and status colors are paired with labels in legends so color is never the only signal.

#### What I corrected

This is where one decision got reversed mid-build, and it's recorded properly in `docs/decisions.md`. The brief's fourth KPI was "Completed This Week," which the dashboard API *does* return (`completedThisWeek`). I started extending the records list endpoint with timezone-aware `completedThisWeek=true` and `updated=true` filters so the card could deep-link to the exact records behind the number — wrote the timezone helpers and tests for both — then changed the card to a lifetime "Completed services" total instead. The reason: the lifetime total is already computed for the status chart (`byStatus.COMPLETED`), so the card added zero queries, and its deep link goes to a plain `status=COMPLETED` filter the list genuinely supports. The half-built filters lost their reason to exist, and I later deleted the abandoned tests outright rather than leave the suite red (the "Reversed decision" entry in `decisions.md` has the full story).

Also corrected from the polish pass: the dashboard's weekly chart initially bucketed completions in JS by raw UTC week. That drifted for viewers east of UTC, so the bucketing moved to the timezone-explicit helpers in `src/lib/local-week.ts` (the server computes the 8 weeks from an `X-Timezone` header) — which is what the daily-reports stretch later generalized.

### Module F7 — Alerts Page + Nav Badge Wiring

#### Prompt

> Context: Modules F0-F6 exist. Backend Module 9 is live. F0 already added a placeholder badge in the nav — wire it for real now.
>
> Task:
> 1. app/(app)/alerts/page.tsx — list of active (non-dismissed) alerts from GET /api/alerts, each showing the vehicle, how long it's been overdue (compute from triggeredAt or the record's dueSince, human-readable like "9 days overdue"), and a Dismiss button (FLEET_MANAGER only) calling POST /api/alerts/[id]/dismiss.
> 2. After a dismiss, remove it from the list immediately (optimistic or refetch) and update the nav badge count.
> 3. Nav badge (from F0's stub): fetch the count on layout mount and refetch after any dismiss action or any service-record transition, so it doesn't go stale mid-session. A simple approach: refetch on route change is fine for this project's scale — no need for real-time push.
> 4. Add an empty state for "no active alerts" that's genuinely reassuring rather than looking broken.

#### What I got

The alerts page lists active alerts with the vehicle, a human-readable "N days overdue" from `triggeredAt`, and a manager-only Dismiss button. Dismissing removes the row (refetch) and broadcasts a custom `ALERT_COUNT_EVENT` so the nav badge updates without a page change; the badge also refetches on every route change via the layout's `AppNav`, which covers transitions that clear overdue states. The empty state is a genuinely reassuring "no overdue vehicles" panel rather than a blank page.

#### What I corrected

The first wiring had the alerts page and the nav badge each fetching independently, so a dismiss updated the list but the badge could lag until the next navigation. The `src/lib/alert-events.ts` broadcast event closed that gap — the page dispatches it after a dismiss, and `AppNav` listens and refetches the count. Technicians don't render the alerts item at all, so the nav skips the fetch for them.

### Module F8 — Polish Pass

#### Prompt

> Context: All feature modules (F0-F7) exist and work.
>
> Task, in one pass across the whole app:
> 1. Consistent loading states: every data-fetching page should show a skeleton or spinner, never a flash of empty/zero content while the first fetch is in flight.
> 2. Consistent error states: every page should handle its fetch failing (network error, 500) with a visible message and, where sensible, a retry button — not a blank page or an uncaught console error.
> 3. Form validation feedback: every form should show inline field errors from Zod validation failures returned by the API, not just a generic toast.
> 4. Responsive check: the sidebar nav should collapse to something usable on a narrow viewport (drawer or bottom nav), and the service-records table should not overflow unreadably on mobile — a stacked card layout below a breakpoint is a reasonable fallback if you don't want to fight a wide table.
> 5. Basic accessibility pass: every icon-only button has an aria-label, form inputs have associated labels, focus states are visible (don't strip outline: none without a visible replacement), color is never the only signal for status (pair status badges with text, not just color).
> 6. Double check role-based UI hides match what the backend actually enforces — go through backend Modules 1-9's role rules one more time and confirm nothing manager-only is shown as clickable-but-then-403s for a technician in a confusing way.
>
> This is the module where you spend time actually clicking through the whole app as both a manager and a technician end to end, fixing whatever feels broken or unpolished.

#### What I got

A real pass over every page (commit `bdd2921`), not a refactor: pages that fetched data got skeletons and visible error states with retry affordances; the app shell became a viewport-locked frame with a collapsible mobile drawer nav; the service-records table gained a mobile card layout below the desktop breakpoint; dialogs and buttons picked up aria-labels and visible focus rings; and the F3 lifecycle-button logic was re-audited against the backend's role rules. `RecordsTable` and the list/detail pages were broken into the shared components used across F2–F4.

#### What I corrected

Mostly the things the pass was designed to find by clicking through as both roles: a technician could reach `/service-records/[id]` for a record they weren't assigned to and see a read-only page (fine), but some manager-only actions were briefly rendered as disabled-looking buttons instead of being hidden or cleanly 403-handled; the fix was `RoleRestrictedPage` on the manager pages plus stricter per-action conditions. Two environment fights also belong to this phase even though they weren't feature bugs: a corrupted `@next/swc` native binary killed the dev server (`f6083ba` — reinstalled clean) and a win32-only native dependency broke Vercel builds (`fbead63` — removed; the `console.log(c))` scratch file that snuck into `adbf580` was deleted in the cleanup).

### Module I0 — Integration Test Pass + the UI redesign it triggered

#### Prompt

> Manually, not via an agent prompt — walk through the entire app once as each role, end to end, and write down anything that breaks:
>
> As FLEET_MANAGER: create a vehicle, edit it, archive it, restore it. Create a service record, book it with a technician and a near-future date. Bulk-upload a CSV with at least one row that should be rejected (lower odometer) — confirm the report is accurate and the DB only updated the valid rows. Export service history, open the CSV, confirm it's correct. Watch the dashboard numbers change as you move a record through the lifecycle. Force a record to overdue, confirm it shows in Alerts with a nav badge, dismiss it, complete the record, drive it overdue again, confirm the alert reappears.
>
> As TECHNICIAN: confirm you only see records assigned to you in "My Records." Start and complete an assigned record. Confirm you cannot see or reach vehicle-create, bulk-upload, or assignment controls anywhere in the UI. Try hitting a manager-only endpoint directly with curl using your technician session cookie — confirm you get a real 403, not just a hidden button. This is the check that actually matters.
>
> Fix whatever you find. THEN write/finish docs/architecture.md, docs/schema.md, docs/decisions.md, and docs/plan.md.

#### What I got

Every flow above worked end to end, including the curl-with-a-technician-cookie check — the 403s are real and come from `requireRole` in the handlers, not from hidden buttons. The pass also produced the single biggest non-feature commit of the project: `b920b50` is a full UI redesign. Clicking through the first version as a reviewer, the flat tables and default styling felt unfinished, so I rebuilt the visual language (warm app canvas, dark branded sidebar, status color system shared by badges and charts, mobile drawer + stacked card layouts) and then re-ran the whole integration pass against the redesign.

#### What I corrected

The redesign re-touched every page — the notes above for F8 mostly describe fixes found during this same reviewer-style clicking, since the two passes overlapped. The one architectural fix it forced: the original layout let tall pages scroll the whole viewport, carrying the nav off-screen; the redesigned shell is viewport-locked (`h-dvh`), with the sidebar fixed and only `<main>` scrolling, which is what made the mobile drawer and desktop rail feel deliberate instead of bolted on.

### Module I1 — Deployment + the late phases (admin, search, stretch) — brief notes

#### Prompt

> Context: App is fully built and integration-tested locally.
>
> Task (following the brief's suggested free-tier path — swap providers if you already deployed differently):
> 1. Neon: confirm your production database is the same one you've been migrating against, or create a clean prod branch/project and run `npx prisma migrate deploy` (not `migrate dev`) against it, then run the seed script once for demo data.
> 2. Render (or wherever your Next.js server-side runs): set DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL as environment variables — never commit these. If you're deploying Next.js as a single full-stack app to Vercel alone, you don't need Render at all — say so in SUBMISSION.md.
> 3. Confirm the deployed app can actually reach Neon (check for IP allowlist issues).
> 4. Seed the production database with enough demo data to look like a real fleet: ~15-20 vehicles, a spread of service records across all four statuses, at least one overdue alert, and a few weeks of completed history so the dashboard chart isn't empty.
> 5. Write SUBMISSION.md: live URL, repo URL, demo credentials for both roles, a note if the free tier sleeps, and anything you know is broken or incomplete.

#### What I got

Deployed as a single full-stack app to Vercel — no Render split, because a Next.js App Router app already serves its own API and a second host would have added a CORS/credential problem for zero benefit (noted in SUBMISSION.md, which the brief explicitly invites). Neon's pooled connection string worked from Vercel without allowlisting. The seed grew to ~15 vehicles with a realistic spread of statuses, several weeks of completed history, and an overdue alert set.

The git history after the deployment commits then shows three phases that the original F-module plan did not predict, each worth a line here because they changed several of the pages described above:

- **Admin role + user management** (`d447a5b`): the brief only required two roles, but "who administers the system" became real once the app was usable. `Role` gained `ADMIN`; a Users page (admin-only) creates technician/manager accounts and deletes users; admins see the full manager view. This also surfaced the HTTPS-only proxy session-cookie bug that took a redeploy to pin down (`949e8ec`).
- **Technician dashboard + universal search** (`adbf580`, `921d9f0`): a Ctrl+K command palette (`CommandSearch`) searches vehicles, service records, and people from anywhere in the app; and the `/dashboard` landing page split by role — technicians now get a personal dashboard (their active jobs, recent completions, their own stats) instead of fleet-wide numbers they could not act on.
- **Daily reports stretch feature** (`c6a487e`): one of the brief's optional ideas, taken further — role-based end-of-day reports that open at 5 PM in the viewer's local timezone, with a review screen for managers/admins and an app-wide reminder banner. This is where the timezone-explicit `local-week`/`local-day` helpers and the `X-Timezone` header convention came from, and it is documented in `docs/decisions.md` (Decisions 7–10) and the daily-report tests.

#### What I corrected

Deployment-specific findings, in order: the first Vercel build broke on the win32-only native dependency (removed in `fbead63`); the proxy session cookie was set without `Secure`, so production logins over HTTPS didn't stick — the fix (`d447a5b`) made the cookie secure-aware and the redeploy (`949e8ec`) confirmed it; and the demo data needed two passes to look like a real fleet rather than a seed dump (the second pass added the overdue alert set and backdated completed history so the dashboard chart and the alerts page read as live on first click). Each is visible in the commit messages, which is the honest record of what the module plans could not predict.
