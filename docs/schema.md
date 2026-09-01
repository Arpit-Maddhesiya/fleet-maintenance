# Schema

The database is a single Postgres schema (`public`) on Neon, managed with Prisma Migrate. Prisma is the source of truth (`prisma/schema.prisma`); everything below is what it generates.

## Tables and columns

### `User`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid, default |
| `email` | `text` | UNIQUE |
| `passwordHash` | `text` | bcrypt hash |
| `name` | `text` | |
| `role` | enum `Role` | `FLEET_MANAGER` \| `TECHNICIAN` |
| `createdAt` | `timestamptz` | default `now()` |

Index: `role`.

### `Vehicle`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `registrationNumber` | `text` | UNIQUE |
| `make` | `text` | |
| `model` | `text` | |
| `currentOdometer` | `int` | Never lowered (app rule) |
| `dateIntervalDays` | `int` | Days between services |
| `mileageInterval` | `int` | Km/miles between services |
| `lastServiceDate` | `timestamptz?` | Null until first completion |
| `lastServiceOdometer` | `int?` | |
| `serviceCycle` | `int` | default 1; incremented on every completed service — the key to the alert-reappearance rule |
| `archivedAt` | `timestamptz?` | Soft-delete; archive hides from default view but keeps history |
| `createdAt` / `updatedAt` | `timestamptz` | |

Index: `archivedAt`.

### `ServiceRecord`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `vehicleId` | `text` | FK → `Vehicle.id` |
| `description` | `text` | |
| `status` | enum `ServiceStatus` | `DUE` \| `BOOKED` \| `IN_SERVICE` \| `COMPLETED`, default `DUE` |
| `scheduledDate` | `timestamptz?` | Set on BOOK |
| `startedAt` | `timestamptz?` | Set on START |
| `completedAt` | `timestamptz?` | Set on COMPLETE |
| `completedOdometer` | `int?` | Set on COMPLETE |
| `dueSince` | `timestamptz` | default `now()`; when the DUE clock starts for the grace-period / overdue rule |
| `createdAt` / `updatedAt` | `timestamptz` | |

Indexes: `vehicleId`, `status`, `scheduledDate`, `updatedAt`.

### `ServiceAssignment`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `serviceRecordId` | `text` | FK → `ServiceRecord.id` |
| `technicianId` | `text` | FK → `User.id` |
| `assignedAt` | `timestamptz` | default `now()` |
| `unassignedAt` | `timestamptz?` | Null while active; set on unassign (soft, never deleted) |

Indexes: `technicianId`, `serviceRecordId`.

This is an **explicit join model**, not an implicit many-to-many, because assignment *history* matters — an implicit relation would only remember the current state.

### `ServiceHistoryEvent`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `serviceRecordId` | `text` | FK → `ServiceRecord.id` |
| `type` | enum `HistoryEventType` | `CREATED` \| `STATUS_CHANGE` \| `ASSIGNED` \| `UNASSIGNED` \| `NOTE` |
| `fromStatus` / `toStatus` | enum `ServiceStatus?` | For `STATUS_CHANGE` |
| `note` | `text?` | For `NOTE` |
| `actorId` | `text` | FK → `User.id`; who did it |
| `technicianId` | `text?` | FK → `User.id`; **captured on the event at write time** so the timeline can name the assigned/unassigned technician without reconstructing history |
| `createdAt` | `timestamptz` | default `now()` |

Index: `(serviceRecordId, createdAt)`.

Deliberately **no `updatedAt` and no update/delete routes** — the timeline is append-only by design (goal 9).

### `Alert`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `vehicleId` | `text` | FK → `Vehicle.id` |
| `serviceCycle` | `int` | The vehicle's cycle when this alert fired |
| `triggeredAt` | `timestamptz` | default `now()` |
| `dismissedAt` | `timestamptz?` | Set by dismiss |
| `dismissedById` | `text?` | FK → `User.id` |

**UNIQUE `(vehicleId, serviceCycle)`** — one alert per vehicle per cycle. Index: `vehicleId`.

## Relationships

- **One-to-many:** `Vehicle` → `ServiceRecord` (a vehicle has many records), `Vehicle` → `Alert`, `User` → `ServiceAssignment` (technician's assignments), `ServiceRecord` → `ServiceAssignment`, `ServiceRecord` → `ServiceHistoryEvent`, `User` → `ServiceHistoryEvent` (actor), and the two named `User` relations (`assignedEvents`, `dismissedAlerts`).
- **Many-to-many:** `ServiceRecord` ↔ `User` (technicians) — modelled *through* the explicit `ServiceAssignment` join table, so both directions are traversable while keeping history. There is no implicit m2m anywhere.

## Constraints: database vs application

**In the database:**
- PKs, FKs, and the two uniqueness rules that carry business meaning: `User.email`, `Vehicle.registrationNumber`, `Alert(vehicleId, serviceCycle)`.
- The `Alert` unique constraint is the *mechanism* behind the reappearance rule — it is enforced by Postgres, not by app code, which is exactly why the lazy-create in the alerts route uses `skipDuplicates` rather than a manual check-then-create (a check-then-create would race).

**In the application:**
- The service lifecycle state machine (`DUE → BOOKED → IN_SERVICE → COMPLETED`) lives in `src/lib/service-lifecycle.ts` as a pure function. It could be a CHECK constraint, but the rules are stateful and need human-readable rejection reasons ("Cannot start a record that is DUE"), which a database constraint cannot express.
- "Odometer never lowers" is enforced in the transition route (COMPLETE odometer must be ≥ current) and the bulk CSV import; the schema itself can't express it.
- The overdue/grace rule lives in `src/lib/overdue.ts` (`isOverdue`), shared by the dashboard and the alerts route.
- Dismissing an alert only sets `dismissedAt`; nothing ever hard-deletes an `Alert`, `ServiceHistoryEvent`, or `ServiceAssignment`.

The line is drawn where the rule is a *shape* of data (unique keys → DB) versus a *behavior* with a message (state machine, business rules → app code).

## What we deliberately denormalised

- `ServiceRecord.dueSince`: a denormalised "when did this record start waiting" stamp that the overdue rule keys off. It could be derived from `createdAt`/`status` transitions, but `createdAt` doesn't move when a record is re-opened, and deriving would require joining history.
- `ServiceHistoryEvent.technicianId`: captured on the event row rather than derived from the assignment history, so an ASSIGNED/UNASSIGNED entry can name the technician even after they're unassigned.
- `Vehicle.currentOdometer` / `lastServiceOdometer` / `serviceCycle`: cached aggregates updated atomically in the COMPLETE transaction, so the dashboard and alerts don't have to scan service history to answer "is this vehicle due / overdue / on which cycle".

## What breaks first at 100x the data

- `ServiceRecord` indexes are fine, but the dashboard's `completedPerWeek` currently fetches **all** completed records' `completedAt` and buckets in JS. At 100x that is a large, pointless transfer — it should become a `GROUP BY` on `date_trunc('week', completedAt)` in SQL.
- The alerts `GET` does a `findMany` of all DUE records every call to decide what to create. At 100x it still works (DUE is a small subset), but the creation path should move to a scheduled job or a Postgres trigger so a read doesn't do writes.
- `ServiceHistoryEvent` grows fastest (append-only). The `(serviceRecordId, createdAt)` index keeps per-record timelines fast, but a global "recent activity" query would need its own index or a partitioned table.
