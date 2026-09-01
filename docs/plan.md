# Plan

## How the work was split

The build followed the module plan in `docs/ai-prompts.md` exactly — nine modules, each one a discrete slice of the system that the next module builds on:

0. Schema & migration (models, enums, indexes, Neon datasource)
1. Auth & role enforcement (Auth.js v5, JWT, `requireRole`)
2. Vehicles CRUD + archive/restore
3. Service records + lifecycle state machine (DUE → BOOKED → IN_SERVICE → COMPLETED)
4. Technician assignments
5. Server-side search/filter/sort/pagination for the record list
6. Bulk CSV odometer import + CSV export
7. Dashboard aggregation
8. Audit timeline (read path)
9. Overdue alerts (lazy creation, dismissal, reappearance rule)

## Why that order

The order is dependency-driven: each module only builds on things already in place. Auth before anything authenticated; vehicles before service records (records belong to vehicles); the lifecycle before assignments (booking is what assigns); the list endpoint before the dashboard (the dashboard reuses the same data shapes); the timeline before alerts (alerts reuse the same record/cycle semantics). The last module, alerts, is the capstone because it ties together the lifecycle (cycle increments on completion), the grace period (shared with the dashboard), and the role model (dismiss is manager-only).

## What I estimated versus what it actually took

Not tracked hour-by-hour. The pattern that held consistently: the "core rule" modules (3, 9) took the longest because the brief's exact wording mattered and the tests had to pin the rule down; the "plumbing" modules (5, 6, 8) were faster once the patterns from 2–4 were established. The single biggest time sink was the reappearance test in Module 9 — getting the in-memory alert store to behave like the unique constraint, and making the test prove the rule rather than just the happy path.

## What I cut when I ran short

Nothing from the 10 goals — all are implemented and tested. What I deliberately did *not* do: any frontend work (explicitly out of scope until the backend is feature-complete), any of the stretch ideas, and any attempt at a real-time alerts push (polling/refetch on the frontend is the plan). I also deferred a scheduled job for alert creation — lazy creation on read is correct at this scale and noted in the architecture doc as the first thing to revisit at 100x data.
