# Plan

## How the work was split

The build was driven by the module plans in `backend-prompts.md` and `frontend-integration-prompts.md`, but the actual sequence in git history tells the real story — the module order is visible commit-by-commit and several things happened that the module plans did not predict.

### Phase 1 — Backend (Modules 0–9, ~Aug 31 – Sep 1)

The backend was built as nine dependency-ordered modules, each committed separately:

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

The order was dependency-driven: auth before anything authenticated; vehicles before service records (records belong to vehicles); the lifecycle before assignments (booking is what assigns); the list endpoint before the dashboard; the timeline before alerts. Module 9 was the capstone because it ties together the lifecycle (cycle increments on completion), the grace period (shared with the dashboard), and the role model (dismiss is manager-only).

### Phase 2 — Frontend (Modules F0–F8 + integration, ~Sep 1 – Sep 2)

The frontend modules built the app shell and every feature page on top of the now-stable API:

- F0 App shell, auth pages, role-aware nav, shared `api-client`, toast provider
- F1 Vehicles: list, create/edit, archive/restore, detail with service history
- F2 Service records: server-driven list (search/filter/sort/pagination, URL as state)
- F3 Record detail: lifecycle actions + assignment management + timeline feed
- F4 My Records (technician view)
- F5 Bulk CSV upload + service-history export
- F6 Dashboard (KPI cards, status/technician breakdowns, 8-week chart)
- F7 Alerts page + nav badge wiring
- F8 Polish pass (loading/error/empty states, responsive, accessibility)
- I0 Manual integration pass as each role

The commits during this phase show the inevitable reality of building on a real stack: `f6083ba` repairs a corrupted `@next/swc` native binary that broke the dev server, `fbead63` removes a win32-only native dependency that was breaking Vercel builds, and `b920b50` is a full UI redesign that landed after clicking through the first version and finding it lacking. None of that was in the module plan.

### Phase 3 — Admin role + user management (~Sep 2)

The brief only required two roles, but "who administers the system" became a real question once the app was usable. `d447a5b` added an `ADMIN` role with a Users page (create technician/manager accounts, delete) and fixed a proxy-session-cookie bug that only surfaced over HTTPS. `949e8ec` redeployed with that cookie fix. This phase is also visible as a genuine schema evolution: the original `Role` enum had two values; it now has three.

### Phase 4 — Technician dashboard + universal search (~Sep 3 – Sep 4)

Two additions that make the app feel finished rather than just feature-complete:

- `adbf580` — a universal search palette (Ctrl+K) that searches vehicles, service records, and people from anywhere in the app.
- `921d9f0` — a technician dashboard. The landing dashboard was manager-shaped; technicians got a role-scoped personal view (their active jobs, recent completions, their own stats) instead of fleet-wide numbers they could not act on.

### Phase 5 — Daily reports (stretch, ~Sep 4)

A stretch feature (one of the brief's optional ideas, taken further): role-based daily work reports. Technicians and fleet managers file an end-of-day summary after 5 PM local time; it stays editable until local midnight; managers and admins review with date + author filters; an app-wide reminder banner appears at 5 PM until the day's report is filed. This introduced the `DailyReport` model, the timezone-explicit local-day helpers, and the role-split `/daily-reports` page.

## Why that order

Each phase only built on things already in place, and each phase ended with a runnable, committed state. Backend-before-frontend meant every page was wired to a real, tested API from day one rather than mocked. The admin role came after the two core roles were proven because it was a smaller, well-understood extension (and its main risk — role checks — was already a solved pattern). The stretch work came last on purpose: the ten goals were solid before anything optional was attempted.

## What I estimated versus what it actually took

I did not track hour-by-hour (the work was spread over a week, roughly in the brief's "2 hours a day" shape). The pattern that held consistently:

- The **core-rule modules** (backend 3, 9) took the longest because the brief's exact wording mattered and the tests had to pin the rule down. Module 9's reappearance test was the single biggest single-module time sink.
- The **plumbing modules** (backend 5, 6, 8; frontend F1, F4, F5) were faster once the patterns from earlier modules were established — the first of any kind (first table, first dialog, first CSV) always cost more than the repeats.
- The **unexpected work** — the corrupted native binary, the win32 dependency breaking Vercel, the HTTPS cookie bug, the UI redesign — was roughly a third of the total time and is entirely absent from the module plans. This is the part that a clean "10 modules, done" plan never accounts for, and it is why the git history is the honest record of the estimate-vs-actual gap.
- The **daily-reports stretch** was deceptively large: timezone-correct "local day" and "after 5 PM" logic, a role-differentiated API, a role-split page, and a reminder banner. The timezone helpers alone needed their own pure tests across DST boundaries.

## What I cut when I ran short

From the ten goals: nothing — all ten are implemented, tested, and wired to the UI.

Deliberately not built (each is a conscious scope decision, not an omission):

- **Any of the brief's other stretch ideas** (fuel tracking, parts inventory, inspections, etc.) — one stretch feature was enough; the ten goals came first.
- **A real-time alerts push** — polling/refetch on navigation covers it at this scale.
- **A scheduled job for alert creation** — lazy creation on read is correct at this scale (noted in the architecture/schema docs as the first thing to revisit at 100x).
- **Timezone configurability beyond the viewer's browser zone** — "this week", the daily-report day, and the 5 PM gate all follow the caller's own `X-Timezone`. There is no admin setting for "the company's timezone"; if the fleet spans zones that would be a real design question, but for a single-site fleet the viewer's zone is the right answer.

## What I would do next with more time

- Move the dashboard's weekly bucketing into SQL (`GROUP BY` on a truncated week) rather than fetching and bucketing in JS — the documented first casualty at 100x data.
- Revisit the abandoned "completed this week / updated-only" list-filter idea (see `decisions.md`): the deep-link KPI card now points at a plain `status=COMPLETED` filter, which is coherent, and the half-built `completedThisWeek`/`updated` query params and their tests have been deleted from the working tree so the suite is green and the rejection is clean. If the idea ever comes back, it should be built as a first-class, timezone-explicit list filter with its own tests from day one.
- Add pagination/server-driven filtering to the admin Users list (it currently fetches all non-admin users and is fine at this size, but would be the next page to need it).
