import type { ServiceRecord } from "@/generated/prisma/client";
import { ServiceStatus } from "@/generated/prisma/enums";

// Grace period for overdue DUE service records, shared across the app.
// Module 7's dashboard imports this constant; Module 9's isOverdue() uses it
// too — the definition lives here, in one place.
export const GRACE_PERIOD_DAYS = Number(process.env.OVERDUE_GRACE_DAYS ?? 7);

const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 86400000;

/**
 * True when a record is still DUE and has been left unbooked for longer than
 * the grace period — the single definition of "overdue" used by the dashboard
 * and the alerts system.
 */
export function isOverdue(record: Pick<ServiceRecord, "status" | "dueSince">): boolean {
  return (
    record.status === ServiceStatus.DUE &&
    record.dueSince.getTime() < Date.now() - GRACE_PERIOD_MS
  );
}
