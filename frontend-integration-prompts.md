# Fleet Maintenance — Frontend + Integration Build Prompts (Module-Wise)

Same rules as the backend file: one module at a time, read every diff, run the
app between modules, commit with a real message, log the prompt + what you
fixed into `docs/ai-prompts.md` as you go.

Two things worth internalizing before you start pasting these in, because
they'll come up on the call:

1. **Role-based UI (hiding buttons a technician shouldn't see) is a UX nicety,
   not a security boundary.** You already built the real boundary server-side
   in the backend modules. Say this explicitly if asked — a reviewer testing
   your app with curl and a technician's token should get the same 403s
   regardless of what the UI shows.
2. **Every list/table in this app must be driven by the server-side
   search/filter/sort/pagination endpoint from backend Module 5**, not a
   client-side `.filter()` over a fully-fetched array. If an agent takes the
   shortcut of fetching everything and filtering in the browser because it's
   easier to wire up, catch it — that's an explicit "must happen on the
   server" requirement in the brief.

Stack assumed: Next.js 15 App Router, Tailwind, shadcn/ui, Recharts, the
backend from the previous 10 modules already live at /api/*.

---

## Module F0 — App Shell, Auth Pages, Role-Aware Nav

```
Context: Backend from Modules 0-9 is complete and working (auth, vehicles,
service records, assignments, search, bulk CSV, dashboard, timeline, alerts).
Next.js 15 App Router + Tailwind is set up. I want shadcn/ui for base
components.

Task:
1. Install and initialize shadcn/ui (button, input, table, dialog, dropdown-menu,
   badge, card, select, tabs, toast/sonner components at minimum).
2. Build app/login/page.tsx as a server component with a form posting to the
   existing Auth.js credentials sign-in action. Show a clear error message on
   bad credentials (don't just redirect silently).
3. Build a root authenticated layout (app/(app)/layout.tsx) with:
   - A left sidebar or top nav with links: Dashboard, Vehicles, Service Records,
     My Records (technician only), Alerts (with a count badge — fetch from
     GET /api/alerts and show the count; poll or refetch on navigation, no
     need for websockets).
   - The nav must read the session role and conditionally show/hide
     manager-only links (Vehicles create, bulk import) — but comment clearly
     that this is cosmetic, the backend already enforces the real boundary.
   - A sign-out button.
4. Add a lib/api-client.ts with a small typed fetch wrapper (base function that
   adds credentials, parses JSON, and throws a typed ApiError with the status
   code and server-provided message on non-2xx) so every page/component below
   uses one consistent way to call the backend instead of raw fetch calls
   copy-pasted everywhere.
5. Set up a toast provider (sonner) at the layout level so any page can call
   `toast.error(...)` / `toast.success(...)` for API results.

Do not build any feature pages yet (no vehicles list, no dashboard content) —
just the shell, auth, nav, and the shared api-client. Stub each nav
destination with a one-line placeholder page so the nav is clickable.
```

---

## Module F1 — Vehicles: List, Create/Edit, Archive/Restore, Detail

```
Context: Module F0 shell/nav/api-client exists. Backend vehicle endpoints
from backend Module 2 are live.

Task:
1. app/(app)/vehicles/page.tsx — table of vehicles (registration, make/model,
   current odometer, date interval, mileage interval, status badge
   Active/Archived) fetched via lib/api-client from GET /api/vehicles.
   Toggle to show archived. FLEET_MANAGER sees an "Add Vehicle" button;
   technicians don't (cosmetic-only per F0's note).
2. A create/edit dialog (shadcn Dialog + form) with client-side validation
   mirroring the Zod schema (don't duplicate the schema by hand — either
   share the Zod schema from the backend via a shared package/import if your
   project structure allows it, or at minimum keep the rules identical and
   comment that they must stay in sync). On submit, call the api-client,
   show a toast on success/failure, refresh the list.
3. Archive/Restore as row actions with a confirmation dialog before archiving
   (don't let one misclick nuke a vehicle from the default view without
   warning).
4. app/(app)/vehicles/[id]/page.tsx — vehicle detail: its core info, current
   status (due/overdue/ok — compute display-side using the same interval logic
   the backend uses, or better, just show whatever the backend already tells
   you if backend Module 7/9 exposes a per-vehicle due status; don't
   reimplement overdue logic in the frontend if the backend already computed
   it), and below that its full service history list (reuse the service
   record row component you'll build properly in Module F2 — stub a simple
   version here if F2 isn't done yet).

Handle loading and empty states explicitly (skeleton or spinner while
fetching, a real empty-state message for zero vehicles, not a blank table).
```

---

## Module F2 — Service Records: Server-Driven List (Search/Filter/Sort/Pagination)

```
Context: Modules F0-F1 exist. Backend search endpoint from backend Module 5
is live at GET /api/service-records.

Task: app/(app)/service-records/page.tsx.

Requirements:
- Controls: text search input (debounced ~300ms before firing a request),
  vehicle filter (select, populated from GET /api/vehicles), status filter
  (select from the 4 enum values + "All"), technician filter (select,
  manager-only — a technician's view is implicitly scoped server-side so
  don't even show this control to a technician), sort dropdown
  (scheduledDate/status/updatedAt) with asc/desc toggle, and pagination
  controls (prev/next + page numbers, showing "X-Y of Z" using the `total`
  from the response).
- CRITICAL: every one of these controls must update the URL's query params
  (use useSearchParams/router.push with shallow routing) and refetch from the
  server with those params — do not fetch once and filter client-side. This
  also gives you shareable/bookmarkable filtered URLs for free, which is a
  nice thing to point out if asked why you did it this way.
- Table columns: vehicle registration, description (truncated with a tooltip
  for the full text), status (as a colored badge), scheduled date, last
  updated, assigned technicians (comma list or avatar stack).
- Row click navigates to app/(app)/service-records/[id]/page.tsx (build this
  as a stub for now — full detail comes in Module F3).
- FLEET_MANAGER sees a "New Record" button opening a create dialog (pick
  vehicle, enter description) posting to POST /api/service-records.

Add a loading skeleton for the table specifically (not a full-page spinner —
the filters/controls should stay usable while a new page of results loads).
```

---

## Module F3 — Service Record Detail: Lifecycle Actions + Assignment Management

```
Context: Modules F0-F2 exist. Backend Modules 3 (lifecycle) and 4 (assignment)
are live.

Task: Build out app/(app)/service-records/[id]/page.tsx fully.

Sections:
1. Header: vehicle info, description (editable inline by the assigned
   technician or a manager — PATCH to update description only, per the brief's
   rule that assignment can't be changed this way), current status as a large
   badge.
2. Lifecycle action button(s), contextual to current status and the viewer's
   role:
   - DUE + FLEET_MANAGER: "Book Service" button opens a dialog to pick a
     scheduled date and at least one technician (multi-select), POSTs to the
     transition endpoint with action=BOOK.
   - BOOKED + (assigned technician or manager): "Start Service" button,
     action=START, probably no dialog needed (confirm then call).
   - IN_SERVICE + (assigned technician or manager): "Complete Service" button
     opens a dialog asking for the final odometer reading, action=COMPLETE.
     Client-side check that it's >= vehicle's currentOdometer before even
     submitting (nicer UX), but the real validation is server-side — if the
     server rejects it, surface the exact server message in a toast, don't
     invent your own.
   - On any transition attempt the server rejects (409), show the server's
     exact reason string to the user — this is the part of the brief that
     explicitly asks for the rejection to explain why, make sure that
     actually reaches the screen.
3. Assignments panel (FLEET_MANAGER only for add/remove; everyone sees the
   current list): list of currently active technician assignments with a
   remove (X) button per row calling DELETE on the assignment; an "Assign
   Technician" select + button calling POST. Optimistically or immediately
   refetch after either action.
4. Timeline panel: fetch from GET /api/service-records/[id]/timeline (backend
   Module 8) and render as a vertical activity feed using the server-provided
   `summary` strings, oldest at top or bottom — pick one and be consistent
   with how you'd narrate "history" naturally (I'd suggest newest-first so the
   most relevant recent activity is visible without scrolling). No edit/delete
   affordances anywhere near this panel — it's read-only by design, and the
   UI should not imply otherwise (no hover-edit icons, nothing).

Make sure every action button's disabled/hidden logic is correct for role +
status combinations you haven't explicitly coded for (e.g., a technician not
assigned to this record viewing it — they should see it if they got here via
"My Records" but should NOT see action buttons for other technicians' records
unless they're assigned).
```

---

## Module F4 — "My Records" (Technician View)

```
Context: Modules F0-F3 exist. Backend endpoint from backend Module 4
(GET /api/technicians/[id]/service-records) is live.

Task: app/(app)/my-records/page.tsx, technician-facing (still viewable by a
manager for their own curiosity if you want, but the meaningful use case is
technicians). Reuse the service-record row/table component from Module F2
if you built it as a reusable component (you should have — if you didn't,
refactor it out now rather than duplicating the table markup).

This page calls the technician-scoped endpoint directly rather than the
general list endpoint with a technicianId filter, matching how the backend
is actually structured. No filters needed beyond maybe a status filter — this
list is already scoped to "assigned to me," it doesn't need vehicle/technician
filters.
```

---

## Module F5 — Bulk CSV Odometer Upload + Service History Export

```
Context: Modules F0-F4 exist. Backend Module 6 endpoints are live.

Task:
1. A "Bulk Update Odometer" page or dialog (manager-only), accessible from the
   Vehicles page. File input accepting .csv, a short inline example of the
   expected format (registrationNumber,odometerReading) so a user isn't
   guessing. On submit, POST the file as multipart/form-data to
   /api/vehicles/bulk-odometer.
2. Render the per-row result report the backend returns as a table: row
   number, registration, status (success/rejected badge), reason if rejected.
   Show a summary line ("12 succeeded, 3 rejected") above the table. This
   report should stay on screen after submission — don't auto-dismiss it,
   the whole point is the user needs to see which rows failed and why.
3. An "Export Service History" button (visible on the Service Records list
   page) that calls GET /api/service-records/export with whatever filters are
   currently active in the URL, and triggers a browser download of the
   returned CSV (use a Blob + temporary anchor element, or just navigate to
   the URL directly if your auth setup allows a plain GET to carry
   credentials).
```

---

## Module F6 — Dashboard

```
Context: Modules F0-F5 exist. Backend Module 7 (GET /api/dashboard) is live.

Task: app/(app)/dashboard/page.tsx, the landing page after login.

Layout:
- Four headline stat cards across the top: Due for Service, In Service,
  Completed This Week, Overdue (make the Overdue card visually distinct —
  it's the one that matters most operationally, e.g. a red/amber accent).
  Each stat card, when clicked, could deep-link to the service-records list
  pre-filtered to that status (nice touch, not required — do it if it's cheap).
- A breakdown section: status distribution (simple bar or donut using
  Recharts, fed by dashboard's byStatus) and a per-technician workload list
  or bar chart (byTechnician).
- A line or bar chart of completedPerWeek across the last 8 weeks (Recharts),
  x-axis = week label, y-axis = count. Confirm it renders 8 points even for
  weeks with zero completions (the backend already guarantees this, just
  don't let the chart library silently collapse zero-value points oddly).

Make this the default route for '/' after login (redirect from '/' to
'/dashboard' for authenticated users).
```

---

## Module F7 — Alerts Page + Nav Badge Wiring

```
Context: Modules F0-F6 exist. Backend Module 9 is live. F0 already added a
placeholder badge in the nav — wire it for real now.

Task:
1. app/(app)/alerts/page.tsx — list of active (non-dismissed) alerts from
   GET /api/alerts, each showing the vehicle, how long it's been overdue
   (compute from triggeredAt or the record's dueSince, human-readable like
   "9 days overdue"), and a Dismiss button (FLEET_MANAGER only) calling
   POST /api/alerts/[id]/dismiss.
2. After a dismiss, remove it from the list immediately (optimistic or
   refetch) and update the nav badge count.
3. Nav badge (from F0's stub): fetch the count on layout mount and refetch
   after any dismiss action or any service-record transition, so it doesn't
   go stale mid-session. A simple approach: refetch on route change is fine
   for this project's scale — no need for real-time push.
4. Add an empty state for "no active alerts" that's genuinely reassuring
   rather than looking broken.
```

---

## Module F8 — Polish Pass

```
Context: All feature modules (F0-F7) exist and work.

Task, in one pass across the whole app:
1. Consistent loading states: every data-fetching page should show a skeleton
   or spinner, never a flash of empty/zero content while the first fetch is
   in flight.
2. Consistent error states: every page should handle its fetch failing
   (network error, 500) with a visible message and, where sensible, a retry
   button — not a blank page or an uncaught console error.
3. Form validation feedback: every form should show inline field errors from
   Zod validation failures returned by the API, not just a generic toast.
4. Responsive check: the sidebar nav should collapse to something usable on a
   narrow viewport (drawer or bottom nav), and the service-records table
   should not overflow unreadably on mobile — a stacked card layout below a
   breakpoint is a reasonable fallback if you don't want to fight a wide table.
5. Basic accessibility pass: every icon-only button has an aria-label, form
   inputs have associated labels, focus states are visible (don't strip
   outline: none without a visible replacement), color is never the only
   signal for status (pair status badges with text, not just color, for
   colorblind users).
6. Double check role-based UI hides match what the backend actually enforces
   — go through backend Modules 1-9's role rules one more time and confirm
   nothing manager-only is shown as clickable-but-then-403s for a technician
   in a confusing way (either hide it or, if shown, handle the 403 gracefully).

This is the module where you spend time actually clicking through the whole
app as both a manager and a technician end to end, fixing whatever feels
broken or unpolished. There's no single prompt that replaces you doing this
yourself — an agent can fix specific issues you find, but you have to find
them by using the app like a reviewer would.
```

---

## Module I0 — Integration Test Pass (do this before deployment)

```
Manually, not via an agent prompt — walk through the entire app once as each
role, end to end, and write down anything that breaks:

As FLEET_MANAGER:
- Create a vehicle, edit it, archive it, restore it.
- Create a service record, book it with a technician and a near-future date.
- Bulk-upload a CSV with at least one row that should be rejected (lower
  odometer) — confirm the report is accurate and the DB only updated the
  valid rows.
- Export service history, open the CSV, confirm it's correct.
- Watch the dashboard numbers change as you move a record through the
  lifecycle.
- Force a record to overdue (either wait, or temporarily lower the grace
  period via env var, or backdate a dueSince directly in the DB for testing),
  confirm it shows in Alerts with a nav badge, dismiss it, complete the
  record, drive it overdue again, confirm the alert reappears.

As TECHNICIAN:
- Confirm you only see records assigned to you in "My Records."
- Start and complete an assigned record.
- Confirm you cannot see or reach vehicle-create, bulk-upload, or assignment
  controls anywhere in the UI.
- Try hitting a manager-only endpoint directly with curl using your
  technician session cookie — confirm you get a real 403, not just a hidden
  button. This is the check that actually matters.

Fix whatever you find. THEN write/finish docs/architecture.md, docs/schema.md,
docs/decisions.md, and docs/plan.md while all of this is fresh, before moving
to deployment.
```

---

## Module I1 — Deployment

```
Context: App is fully built and integration-tested locally.

Task (following the brief's suggested free-tier path — swap providers if you
already deployed differently):
1. Neon: confirm your production database is the same one you've been
   migrating against, or create a clean prod branch/project and run
   `npx prisma migrate deploy` (not `migrate dev`) against it, then run the
   seed script once for demo data.
2. Render (or wherever your Next.js server-side runs, if you're not doing a
   single Vercel deploy for everything): set DATABASE_URL, DIRECT_URL,
   NEXTAUTH_SECRET, NEXTAUTH_URL as environment variables in the platform's
   dashboard — never commit these. If you're deploying Next.js as a single
   full-stack app (App Router API routes included) to Vercel alone, you don't
   need Render at all — say so in SUBMISSION.md rather than following the
   brief's suggested split just because it was suggested.
3. Confirm the deployed app can actually reach Neon (check for IP allowlist
   issues — Neon's pooled connection string should work from any host without
   allowlisting, but verify).
4. Seed the production database with enough demo data to look like a real
   fleet: at least ~15-20 vehicles, a spread of service records across all
   four statuses, at least one overdue alert, and a few weeks of completed
   history so the dashboard chart isn't empty.
5. Write SUBMISSION.md: live URL, repo URL, demo credentials for both roles
   (from the seed script), a note if the free tier sleeps and the first load
   is slow, and anything you know is broken or incomplete and why you left it.

Do not skip the demo data step — an empty shell app, even if fully
functional, reads as unfinished to a reviewer clicking through it cold.
```
