# Schema

A single Postgres schema (`public`) on Neon, managed with Prisma Migrate. Prisma is the source of truth (`prisma/schema.prisma`); everything below is what it generates. Every timestamp is `timestamptz`.

## Enums

| Enum | Values |
|------|--------|
| `Role` | `ADMIN`, `FLEET_MANAGER`, `TECHNICIAN` |
| `ServiceStatus` | `DUE`, `BOOKED`, `IN_SERVICE`, `COMPLETED` |
| `HistoryEventType` | `CREATED`, `STATUS_CHANGE`, `ASSIGNED`, `UNASSIGNED`, `NOTE` |
| `DailyReportType` | `TECHNICIAN`, `FLEET_MANAGER` |

`ADMIN` was added after the original two-role schema (the admin role manages users; admins also see the whole fleet and review daily reports but do not file them).

## Tables and columns

### `User`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `email` | `text` | UNIQUE |
| `passwordHash` | `text` | bcrypt hash |
| `name` | `text` | |
| `role` | enum `Role` | `ADMIN` \| `FLEET_MANAGER` \| `TECHNICIAN` |
| `createdAt` | `timestamptz` | default `now()` |
| `reports` | relation | `DailyReport[]` (author) |

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

### `DailyReport`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` | PK, cuid |
| `authorId` | `text` | FK → `User.id` |
| `reportDate` | `timestamptz` | The UTC instant of *local midnight* of the report's day in the author's timezone |
| `type` | enum `DailyReportType` | Which form the author filed |
| `jobsCompleted` | `int` | default 0; technician field |
| `hoursWorked` | `int` | default 0; technician field |
| `registrations` | `text` | default `""`; technician field, one vehicle registration per line |
| `bookingsCount` | `int` | default 0; fleet-manager field |
| `inspectionsCount` | `int` | default 0; fleet-manager field |
| `notes` | `text` | default `""`; the manager's summary / technician's issues box |
| `createdAt` / `updatedAt` | `timestamptz` | |

**UNIQUE `(authorId, reportDate)`** — one report per person per local day. Indexes: `reportDate`, `authorId`, `type`.

One model serves both form types; the role decides which columns carry meaning, and the others stay zero/empty. Two separate tables would be more rigid for no benefit — the read paths never mix the two shapes in a way that needs a join.

## Relationships

- **One-to-many:** `Vehicle` → `ServiceRecord`, `Vehicle` → `Alert`, `User` → `ServiceAssignment` (technician's assignments), `ServiceRecord` → `ServiceAssignment`, `ServiceRecord` → `ServiceHistoryEvent`, `User` → `ServiceHistoryEvent` (actor), `User` → `DailyReport` (author).
- **Many-to-many:** `ServiceRecord` ↔ `User` (technicians) — modelled *through* the explicit `ServiceAssignment` join table, so both directions are traversable while keeping history. There is no implicit m2m anywhere.

## Constraints: database vs application

**In the database:**
- PKs, FKs, and the uniqueness rules that carry business meaning: `User.email`, `Vehicle.registrationNumber`, `Alert(vehicleId, serviceCycle)`, `DailyReport(authorId, reportDate)`.
- The `Alert` unique constraint is the *mechanism* behind the reappearance rule — enforced by Postgres, not app code, which is exactly why the lazy-create in the alerts route uses `skipDuplicates` rather than a racy check-then-create.
- The `DailyReport` unique pair is what makes "one report per person per day" hold even though `reportDate` is a local-midnight *instant*: two users in different zones filing the same UTC day get different `reportDate` values, and re-submitting today upserts rather than duplicates.

**In the application:**
- The service lifecycle state machine lives in `src/lib/service-lifecycle.ts` as a pure function. It could be a CHECK constraint, but the rules are stateful and need human-readable rejection reasons ("Cannot start a record that is DUE"), which a DB constraint cannot express.
- "Odometer never lowers" is enforced in the transition route (COMPLETE odometer must be ≥ current) and the bulk CSV import.
- The overdue/grace rule lives in `src/lib/overdue.ts` (`isOverdue`), shared by the dashboard and the alerts route.
- The daily-report "after 5 PM local" gate and "today" boundary are computed at request time from the `X-Timezone` header — they are behavior with a user-facing message, so they live in app code, not the schema.

The line is drawn where the rule is a *shape* of data (unique keys → DB) versus a *behavior* with a message (state machine, business rules → app code).

## What we deliberately denormalised

- `ServiceRecord.dueSince`: a denormalised "when did this record start waiting" stamp the overdue rule keys off. It could be derived from `createdAt`/`status` transitions, but `createdAt` doesn't move when a record is re-opened, and deriving would require joining history.
- `ServiceHistoryEvent.technicianId`: captured on the event row rather than derived from the assignment history, so an ASSIGNED/UNASSIGNED entry can name the technician even after they're unassigned.
- `Vehicle.currentOdometer` / `lastServiceOdometer` / `serviceCycle`: cached aggregates updated atomically in the COMPLETE transaction, so the dashboard and alerts don't have to scan service history to answer "is this vehicle due / overdue / on which cycle".
- `DailyReport.reportDate` as a local-midnight instant: deliberately not "the UTC date of filing". A raw UTC day would silently drift for anyone whose local date differs from UTC's (most of the planet at 6 PM), producing either two reports for one local day or one report for two.

## What breaks first at 100x the data

- `ServiceRecord` indexes are fine, but the dashboard's weekly chart currently fetches all completed records' `completedAt` within the last 8 weeks and buckets in JS. At 100x that is a large, pointless transfer — it should become a SQL `GROUP BY` on a truncated week expression. (The "this week" KPI is already a `count` with a window.)
- The alerts `GET` does a `findMany` of all DUE records every call to decide what to create. At 100x it still works (DUE is a small subset), but the creation path should move to a scheduled job or a Postgres trigger so a read doesn't do writes.
- `ServiceHistoryEvent` grows fastest (append-only). The `(serviceRecordId, createdAt)` index keeps per-record timelines fast, but a global "recent activity" query would need its own index or a partitioned table.
- `DailyReport` grows one row per reporter per day (~6 rows/day here). Bounded and small, but a "who has NOT filed" query over a long range would want a generated calendar or a window function rather than per-day client math.
