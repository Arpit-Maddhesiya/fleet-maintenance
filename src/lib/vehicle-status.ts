/**
 * Display-side vehicle due status.
 *
 * The backend does not expose a per-vehicle due status (the dashboard exposes
 * counts, not per-vehicle state), so this page computes a status for the
 * detail header from the vehicle + its service records.
 *
 * Rules (mirroring the backend's logic in src/lib/overdue.ts and the interval
 * fields on Vehicle):
 * - A vehicle is due when the date interval has elapsed since the last service
 *   OR the mileage interval has been covered — whichever comes first.
 * - Overdue is the backend's definition (src/lib/overdue.ts): there is an
 *   active DUE service record whose dueSince is older than GRACE_PERIOD_DAYS.
 *
 * ⚠️ This is a display helper only. The backend (lib/overdue.ts, the lifecycle
 * module, the alerts route) is the source of truth for "overdue" — keep the
 * grace-period constant and interval rules here in sync with it.
 */

import type { ServiceRecord, Vehicle } from "@/lib/types";

export type VehicleStatus = "OK" | "DUE" | "OVERDUE";

export const GRACE_PERIOD_DAYS = 7;

export function getVehicleStatus(
  vehicle: Pick<Vehicle, "lastServiceDate" | "lastServiceOdometer" | "currentOdometer" | "dateIntervalDays" | "mileageInterval">,
  records: Pick<ServiceRecord, "status" | "dueSince">[],
  now: Date = new Date()
): VehicleStatus {
  // Is there a DUE record currently waiting on this vehicle? If it predates
  // the grace period, the vehicle is overdue (backend's isOverdue rule).
  const activeDue = records.find((r) => r.status === "DUE");
  if (activeDue) {
    const dueSince = new Date(activeDue.dueSince).getTime();
    const graceMs = GRACE_PERIOD_DAYS * 86400000;
    if (now.getTime() - dueSince > graceMs) {
      return "OVERDUE";
    }
    return "DUE";
  }

  // No waiting record — compute whether the interval says one is due.
  if (!vehicle.lastServiceDate || vehicle.lastServiceOdometer === null) {
    return "OK";
  }

  const lastService = new Date(vehicle.lastServiceDate).getTime();
  const daysSince = (now.getTime() - lastService) / 86400000;
  const kmSince = vehicle.currentOdometer - vehicle.lastServiceOdometer;

  if (daysSince >= vehicle.dateIntervalDays || kmSince >= vehicle.mileageInterval) {
    return "DUE";
  }

  return "OK";
}
