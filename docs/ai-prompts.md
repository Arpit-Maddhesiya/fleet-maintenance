# AI prompts

The prompts actually used, grouped by what they were trying to achieve. One produced something wrong; what I corrected is noted under it.

## Backend module build-out (Modules 0–9)

### Prompt

For each module in `backend-prompts.md` (auth, vehicles, service records, lifecycle, assignments, list, bulk CSV, dashboard, timeline, alerts): "Implement module N as specified: <paste the module text>. Follow the patterns already established in the codebase — read the relevant existing files first. Write the tests the module asks for. Run the full Vitest suite and typecheck before finishing."

### What I got

A working slice per module, following the route-handler + Zod + Prisma + Vitest conventions, with tests.

### What I corrected

Several things, each caught by reading the diff and running tests:
- The alerts route originally used a manual "check if alert exists, then create" (`findFirst` then `create`) instead of `createMany(..., skipDuplicates: true)`. That's a race and it re-implements what the unique constraint already guarantees. I rewrote it to rely on the constraint, which is also what makes the reappearance rule correct.
- My first version of the reappearance test used a hand-rolled `mockImplementation` whose parameter types didn't match Prisma's strict delegate types — `tsc` failed. I fixed it by casting the implementations, the same way the existing tests handle mock values.
- The dashboard's `overdueCount` originally kept its own `dueSince < now - grace` query even after `isOverdue()` existed. The module plan says the definition must live in one place, so I changed it to fetch DUE records and count with `isOverdue()`.

## Debugging the manual lifecycle pass

### Prompt

"Run the full lifecycle manually: create vehicle → create record → book → start → complete → check dashboard → check timeline → force overdue → check alert → dismiss → complete another cycle → check alert reappears. Use curl against the dev server."

### What I got

The full flow verified end-to-end against the real Neon database — cycle incremented, dashboard numbers moved, timeline correct, alert created/dismissed, and a brand-new alert reappeared on the next cycle. Also surfaced a real environment finding: a pre-existing dev server on port 3000 was serving stale routes (404 on `/api/auth/*`), which is why the first curl pass failed. The fix was running my own server on a separate port — no code change needed.

### What I corrected

The first sign-in attempt used a fake `csrfToken` and got a 404; the real flow needs a token from `GET /api/auth/csrf` first. Also, a `node -e` one-liner to backdate `dueSince` failed on shell escaping and on the generated client being TS-only — I switched to a `tsx` script in the project root (deleted afterward).

## Documentation

### Prompt

"Write `docs/schema.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/plan.md`, and the backend portions of `docs/ai-prompts.md`, answering each file's stub questions based on the actual code."

### What I got

All five docs filled in from the real schema, routes, and decisions, including one reversed decision (the grace-period duplication) and the 100x-data weak points.
