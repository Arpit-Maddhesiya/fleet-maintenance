# Submission

Fill this in and commit it. This is the first file we open.

## Links

- **GitHub repository:** https://github.com/Arpit-Maddhesiya/fleet-maintenance
- **Live application:** https://fleet-maintenance-ten.vercel.app/
- **Live API docs:** https://fleet-maintenance-ten.vercel.app/api-docs

## Notes for the reviewer

- The daily-reports feature is the chosen stretch goal. Reports open at 5 PM **in your browser's local timezone** — if you log in before 5 PM your time, the form is locked and the API returns 403 until the cutoff. The seed includes backdated reports from recent weekdays so the review screens are populated regardless of when you look.
- All date bucketing ("this week", the 8-week chart, the daily-report day) follows the viewer's timezone, sent as an `X-Timezone` header. See `docs/architecture.md`.
- The deployment uses the free Vercel tier. <If it sleeps on idle, say so here.>

## Demo credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@fleet.test | password123 |
| Fleet Manager | manager@fleet.test | password123 |
| Technician | tech1@fleet.test | password123 |
| Technician | tech2@fleet.test | password123 |
| Technician (3–5) | tech3@fleet.test … tech5@fleet.test | password123 |

The seed also creates ~15 vehicles with a spread of DUE / BOOKED / IN_SERVICE / COMPLETED records, an overdue alert set, several weeks of completed history, and backdated daily reports for the manager and all five technicians.

## Stack

| Layer | What you used | Why |
|-------|---------------|-----|
| Frontend | Next.js 16 App Router, React Server Components + client components, Tailwind, shadcn-style `ui/` components, Recharts, sonner | One framework for the whole app — pages and API routes deploy together, no CORS/credential split between a UI and a backend |
| Backend | Next.js route handlers (`src/app/api/`), Auth.js v5 (Credentials, JWT), Zod, pure domain modules | Thin handlers over a shared, tested rule layer; typed errors mapped once; server is the real authorization boundary |
| Database | Prisma + Neon serverless Postgres | Managed Postgres with a free tier; Prisma Migrate + generated client checked into `src/generated/prisma` |
| Hosting | Vercel (single full-stack deploy) | The app is one Next.js project; the brief's suggested Render+Supabase split would add nothing here |

## Goal checklist

Mark each honestly. Partial is fine — say what is partial.

| # | Goal | Status | Notes |
|---|------|--------|-------|
| 1 | Accounts and roles | Done | Three roles (added `ADMIN` for user management). Role checks enforced in route handlers via `requireRole`, not just hidden in the UI — a technician hitting a manager endpoint with curl gets 403. |
| 2 | Vehicles | Done | Create/edit/archive/restore; archive hides from default view without deleting history. |
| 3 | Service records | Done | One record per vehicle with description + assigned technicians; vehicle detail shows full history. |
| 4 | Service lifecycle with rules | Done | Due → Booked → In Service → Completed as a pure tested state machine; illegal moves rejected with a message; completing resets date + mileage counters atomically; overdue grace period shared via `src/lib/overdue.ts`. |
| 5 | Assignment | Done | Explicit `ServiceAssignment` join model with history; manager-only add/remove; technicians see one list of their active assignments. |
| 6 | Finding service records | Done | Server-side search/filter/sort/pagination in the Prisma query; the UI round-trips through the URL and refetches (no client-side filtering of a full fetch). |
| 7 | Bulk odometer + export | Done | CSV upload processes row-by-row (valid rows apply even when others reject) with a per-row report; service history exports as CSV with the active filters. |
| 8 | Dashboard | Done | KPI cards, by-status + by-technician breakdowns, 8-week completions chart. KPIs deep-link to real, supported list filters. |
| 9 | History you cannot rewrite | Done | Append-only `ServiceHistoryEvent`; timeline endpoint returns it read-only; no update/delete route exists. |
| 10 | Overdue alerts | Done | Lazy-created per `(vehicleId, serviceCycle)`; nav count badge; manager dismiss; reappearance on the next cycle guaranteed by the unique constraint (tested). |

The daily-reports stretch feature is documented in `docs/` and covered by tests; it is the one optional addition beyond the ten goals.

## How much time did you actually spend?

About 12–14 hours of actual working time, spread across five days (31 Aug – 4 Sep) rather than one long session, the git history tells that story on its own, with most commits landing in evening blocks. Roughly two-thirds was feature work. The other third went to things that are invisible in the final repo but very real while they were happening: a corrupted `@next/swc` binary that killed the dev server, a Windows-only dependency that broke the Vercel build, an HTTPS-only session-cookie bug that took a redeploy to pin down, and a full UI redesign after I clicked through the first version and found it lacking. I did not keep a per-module timesheet, so treat that split as an honest estimate from the commit calendar, not an exact ledger.

## What would you do next, with another 12 hours?

- **Mileage burn-rate forecasting.** The brief's story is a van that "quietly passed its mileage interval while everyone was only watching the calendar." Every vehicle already stores its odometer history, so the data for a per-vehicle km/day burn rate is sitting in the DB. I'd project when each vehicle will trip its *mileage* interval and show something like "est. due for service around 22 Sep — odometer will hit the limit first" on the vehicle page and dashboard. It catches the exact failure mode a calendar-only view misses, using data we already collect.
- **Plausibility checks on odometer readings.** The brief's other failure is a mis-keyed reading that quietly corrupts the next few weeks of tracking. Today the rule only rejects readings *lower* than the last one. With a burn-rate baseline I could flag readings that are implausibly far from the trend — too low, or an impossible jump — and ask for confirmation instead of silently accepting them into the vehicle's history.
- **A morning digest.** Daily reports and alerts are both pull-based today. I'd add a scheduled push — yesterday's completions, today's booked work, vehicles coming due in the next week, and which technicians have not filed yesterday's report. It would turn the two newest features into something a manager actually opens at the start of the day, rather than something they remember to check.

## What are you least happy with in this codebase, and why?

- **The abandoned timezone-list-filter work still in the tree.** I started making the service-records list endpoint understand `completedThisWeek=true` (timezone-aware) and `updated=true`, wrote tests for both, then changed the KPI to a lifetime total which removed the reason the filters existed. I should have deleted that work the moment it became unneeded instead of leaving it uncommitted with two failing tests. It is documented and flagged rather than hidden, but it is exactly the kind of loose end I'd clean up before calling this done.
- **The dashboard's weekly chart buckets in JavaScript** over a fetched set of completed records. Correct and fast at this scale; the first thing I'd rewrite at 100x.
- **Some client components duplicate small date-format helpers** instead of importing one shared formatter — harmless, slightly untidy, and the kind of thing a reviewer with fresh eyes notices before I do.
