<div align="center">

# Fleet Maintenance Manager

**A full-stack fleet service management system** — track vehicles, schedule services, assign technicians, and never let a van quietly sail past its mileage interval again.

![Login](docs/screenshots/login.png)
![Dashboard](docs/screenshots/dashboard.png)
![API Reference](docs/screenshots/api-docs.png)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://fleet-maintenance-ten.vercel.app/)
[![API Docs](https://img.shields.io/badge/API%20Docs-Swagger%20UI-85EA2D?style=for-the-badge&logo=swagger&logoColor=white)](https://fleet-maintenance-ten.vercel.app/api-docs)
[![Next.js](https://img.shields.io/badge/Next.js%2016-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma%207-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech)
[![Tailwind](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Auth.js](https://img.shields.io/badge/Auth.js-6466F1?style=for-the-badge&logo=nextauth&logoColor=white)](https://authjs.dev)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev)

**Built as an engineering take-home assignment** · 10 goals · ~12 hours · commit-by-commit history

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Demo Credentials](#demo-credentials)
- [Architecture at a Glance](#architecture-at-a-glance)
- [API Documentation](#api-documentation)
- [Running Locally](#running-locally)
- [Testing](#testing)
- [Project Documentation](#project-documentation)
- [What Makes This Stand Out](#what-makes-this-stand-out)
- [Roadmap / What's Next](#roadmap--whats-next)

---

## The Problem

> Picture a small logistics company running a fleet of several dozen delivery vans and trucks, each supposed to go in for service on a schedule — but "schedule" currently means whichever comes first among a wall calendar, a technician's memory, and a driver mentioning the engine sounds odd.

The result is predictable: a van goes in **six weeks late** because nobody tracked that it had quietly passed its *mileage* interval. A mis-keyed odometer reading silently corrupts the next few weeks of tracking. Asking "which vehicles are due today?" means cross-checking two systems that are both out of date.

**Fleet Maintenance Manager replaces the calendar and the whiteboard** with a single source of truth: date *and* mileage intervals, enforced lifecycle rules, and a vehicle flagged the moment either interval is reached.

---

## Features

### Role-based accounts, enforced on the server
Three roles — **Admin**, **Fleet Manager**, and **Technician** — sign in with email + password (Auth.js v5, bcrypt, JWT sessions). Role checks run in every API handler via `requireRole()`, *not* just hidden buttons. A technician hitting a manager endpoint with `curl` gets a real **403**.

### Vehicles
Managers create vehicles with registration, make/model, odometer, **date interval** and **mileage interval**. Edit, archive, and restore — archiving hides a vehicle from the default fleet view **without destroying its service history**.

### Service records with a real lifecycle
Every record moves through a strictly enforced state machine:

```
Due → Booked → In Service → Completed
```

- Booking assigns a scheduled date + technician
- Completing a service **atomically resets both the date and mileage counters**
- Any illegal move is rejected by the server with a message explaining why (e.g. *"Cannot move from COMPLETED to BOOKED."*)
- Rules live in one pure, unit-tested module — not scattered across routes

### Assignment management
Any number of technicians per record, any number of records per technician — with a full assignment **history** (who was assigned when, who was removed). Only managers add or remove assignments; technicians see exactly one list: **their** records, across every vehicle.

### Finding service records — all on the server
One list across every vehicle with text search, vehicle/status/technician filters, sorting, and pagination — expressed entirely in the SQL query. The UI round-trips through the URL (shareable, bookmarkable filtered views) and **never** filters a full fetch in the browser.

### Bulk CSV odometer import + CSV export
Drop in a CSV of registrations + readings: valid rows apply, rejected rows are reported **with a reason** (e.g. a reading lower than the one on file). Export the service history as CSV with the active filters applied.

### Dashboard
Headline KPIs (Due, In Service, Completed, **Overdue**), status distribution, per-technician workload, and an 8-week completions chart. KPI cards deep-link to the pre-filtered list. **Technicians get their own personal dashboard** — their open jobs, their completions, their stats.

### History you cannot rewrite
Every record has an append-only audit timeline — created, every status change (old → new, by whom), every assignment and unassignment. **No edit, no delete. Not even for managers.**

### Overdue alerts that come back
An overdue record appears in Alerts with a live count badge in the nav. Dismissing an alert for cycle *N* does **not** suppress the alert for cycle *N+1* if the vehicle slips overdue again — guaranteed by a database unique constraint and covered by a test.

### Bonus: role-based daily work reports (stretch goal)
Technicians and managers file an end-of-day report after **5 PM in their own timezone**; it stays editable until local midnight. Managers/admins review with date + author filters; a reminder banner appears until the day's report is filed. Timezone-correct local-day math, tested across DST boundaries.

### Bonus: universal search (Ctrl+K)
Search vehicles, service records, and people from anywhere in the app.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js 16 App Router, React Server Components, Tailwind CSS, shadcn-style `ui/`, Recharts, sonner | One framework for pages + API — deploys together, no CORS split |
| **Backend** | Next.js route handlers (`/api/*`), Auth.js v5 (Credentials, JWT), Zod validation | Thin handlers over pure, tested domain modules; typed errors mapped once |
| **Database** | Prisma 7 + Neon serverless PostgreSQL | Managed Postgres; generated client checked into the repo; migrations via `DIRECT_URL` |
| **Testing** | Vitest — **16 test files** covering lifecycle rules, role enforcement, pagination, CSV import, alerts reappearance, timezone helpers | The domain rules are the heart of the brief; they're pinned by tests |
| **Hosting** | Vercel (full-stack, single deploy) | The app is one Next.js project; no second host needed |
| **API docs** | OpenAPI 3.0 spec (`src/lib/openapi.ts`) + Swagger UI at `/api-docs` | Every endpoint documented with schemas and role rules; same-origin so "Try it out" works against the live API |

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@fleet.test` | `password123` |
| **Fleet Manager** | `manager@fleet.test` | `password123` |
| **Technician** | `tech1@fleet.test` | `password123` |

The production database is seeded with **~15 vehicles**, a spread of DUE / BOOKED / IN_SERVICE / COMPLETED records, an overdue alert set, several weeks of completed history, and backdated daily reports — so every screen reads as a real, live fleet on first click.

> The free Vercel tier may sleep on idle — the first load after a pause can take a minute to wake.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 16 (single deploy)              │
│                                                             │
│  Pages (RSC + client)        Route handlers  /api/*         │
│  ─────────────────────       ─────────────────────          │
│  • Role-aware UI             • auth() → requireRole()       │
│  • apiFetch<T>() wrapper     • Zod validation               │
│  • URL-as-state lists        • pure domain module → patch   │
│  • Recharts dashboards       • one $transaction per write   │
│                                                             │
│  src/lib/ (pure rules)                                      │
│  • service-lifecycle.ts  (Due → Booked → In Service → Done) │
│  • overdue.ts            (grace period + isOverdue)         │
│  • local-week / local-day (timezone-explicit calendar)      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Prisma (Neon adapter)
                    ┌──────────▼──────────┐
                    │   Neon PostgreSQL    │
                    │  User · Vehicle ·    │
                    │  ServiceRecord ·     │
                    │  ServiceAssignment · │
                    │  ServiceHistoryEvent │
                    │  Alert · DailyReport │
                    └──────────────────────┘
```

**Key principles:**

- **Domain rules are pure functions.** The state machine and overdue logic have zero database access — route handlers load data, call the rule, and persist the returned patch. Rules are unit-testable and live in exactly one place.
- **The server is the authorization boundary.** UI hiding is cosmetic; every privileged handler calls `requireRole()`.
- **Append-only history.** Assignments are soft-deleted (`unassignedAt`); timeline events are never updated; alerts are keyed by service cycle.
- **One error vocabulary.** `handleError()` maps typed errors → JSON status codes; the UI surfaces the *server's* message via `ApiError`.

---

## API Documentation

Every endpoint ships with an **interactive, OpenAPI 3.0 reference** powered by Swagger UI. Browse the whole API — auth, vehicles, the service lifecycle, assignments, dashboard, alerts, daily reports, user management, and search — with request/response schemas and the exact role rule per route.

- **Live:** [fleet-maintenance-ten.vercel.app/api-docs](https://fleet-maintenance-ten.vercel.app/api-docs)
- **Raw OpenAPI spec (JSON):** [fleet-maintenance-ten.vercel.app/api/docs](https://fleet-maintenance-ten.vercel.app/api/docs)
- **Local:** [`http://localhost:3000/api-docs`](http://localhost:3000/api-docs) after `npm run dev`

The docs are served from the same origin as the app, so Swagger UI's "Try it out" sends your session cookie and works against the live API exactly like the UI does. The spec is a single maintained module (`src/lib/openapi.ts`), not generated noise.

---

## Running Locally

### Prerequisites

- **Node.js 20+**
- A **Neon Postgres** database (free tier) — or any Postgres

### 1. Clone & install

```bash
git clone https://github.com/Arpit-Maddhesiya/fleet-maintenance.git
cd fleet-maintenance
npm install
```

### 2. Configure environment

Create a `.env` file with:

```env
# Pooled connection for the app runtime
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/neondb?sslmode=require"

# Direct connection for Prisma Migrate
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/neondb?sslmode=require"

# Auth.js secret — generate with: npx auth secret
AUTH_SECRET="your-32-char-secret"
```

### 3. Migrate & seed

```bash
npx prisma migrate dev
npx prisma db seed
```

### 4. Run it

```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** and sign in with the [demo credentials](#demo-credentials). The API reference is at **[http://localhost:3000/api-docs](http://localhost:3000/api-docs)**.

---

## Testing

```bash
npm test
```

The suite (Vitest) pins the behavior that matters most to the brief:

- **Lifecycle state machine** — every legal transition + illegal moves rejected with the exact message
- **Role enforcement** — technicians get 403 on manager endpoints, and their queries can't be widened via filters
- **CSV bulk import** — valid rows apply even when others in the same file are rejected
- **Alerts reappearance rule** — dismiss cycle N, complete the service, drive it overdue → a *new* alert for cycle N+1
- **Timezone helpers** — local-day and 5 PM cutoff math across DST boundaries

---

## Project Documentation

This repository ships with a full engineering write-up under [`docs/`](docs):

| File | What it covers |
|------|----------------|
| [`docs/architecture.md`](docs/architecture.md) | Moving pieces, data flow, request path for a real action, what was deliberately *not* built |
| [`docs/schema.md`](docs/schema.md) | Every table, column, relationship, constraint, and the 100× data weak points |
| [`docs/decisions.md`](docs/decisions.md) | 10 real decisions with rejected alternatives — including one reversed mid-build |
| [`docs/plan.md`](docs/plan.md) | How the work was sequenced across 5 sessions, estimates vs. reality, what got cut |
| [`docs/ai-prompts.md`](docs/ai-prompts.md) | The full prompt log — including the ones that produced wrong output and the fixes |

---

## What Makes This Stand Out

- **Honest git history** — ~30 incremental commits telling the real story: backend modules → frontend modules → admin role → technician dashboard → daily-reports stretch, including the environment fights (a corrupted native binary, a Windows-only dependency breaking Vercel, an HTTPS-only cookie bug) that no clean plan predicts.
- **The alert reappearance rule works by construction** — a database unique constraint on `(vehicleId, serviceCycle)`, not a hand-rolled flag that would silently break.
- **Timezone-correct by design** — "this week", the 8-week chart, and the daily-report 5 PM gate all follow the *viewer's* timezone (sent as an `X-Timezone` header), never the server's clock.
- **A UI that was actually reviewed** — a full redesign landed after clicking through the first version as a reviewer would, and the technician-vs-manager flows were re-verified end to end with a real session cookie.
- **Interactive API docs** — a hand-maintained OpenAPI 3.0 spec served alongside the app, with role rules per endpoint and a working "Try it out" (see [API Documentation](#api-documentation)).

---

## Roadmap / What's Next

- **Mileage burn-rate forecasting** — project *when* each vehicle will trip its mileage interval using the odometer history already in the DB ("est. due ~22 Sep").
- **Plausibility checks on readings** — flag readings implausibly far from a vehicle's trend, not just readings lower than the last one.
- **A morning digest** — yesterday's completions, today's booked work, vehicles coming due, and who hasn't filed yesterday's report, pushed to managers.

---

<div align="center">

Built with TypeScript, Next.js, Prisma, and a lot of careful rule-writing · [docs/decisions.md](docs/decisions.md) tells the real story

</div>
