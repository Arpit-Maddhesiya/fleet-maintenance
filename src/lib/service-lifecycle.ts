import type { ServiceRecord, Vehicle } from "@/generated/prisma/client";
import { ServiceStatus } from "@/generated/prisma/enums";

/**
 * The ServiceRecord lifecycle state machine — the core domain rule of the app.
 *
 * This module is deliberately pure: transition() never touches the database.
 * Route handlers load the record, call this function, and persist the returned
 * patch inside a transaction. Keeping the rules here means they live in
 * exactly one place and are trivially unit-testable.
 *
 *   DUE --BOOK--> BOOKED --START--> IN_SERVICE --COMPLETE--> COMPLETED
 */

export const TransitionAction = {
  BOOK: "BOOK",
  START: "START",
  COMPLETE: "COMPLETE",
} as const;

export type TransitionAction = (typeof TransitionAction)[keyof typeof TransitionAction];

export interface TransitionPayload {
  scheduledDate?: string | Date;
  technicianId?: string;
  completedOdometer?: number;
}

export type TransitionResult =
  | { ok: true; patch: Partial<ServiceRecord> }
  | { ok: false; reason: string };

function illegal(current: ServiceStatus, action: TransitionAction): TransitionResult {
  return {
    ok: false,
    reason: `Cannot move from ${current} to ${action}.`,
  };
}

export function transition(
  record: Pick<ServiceRecord, "status">,
  action: TransitionAction,
  payload: TransitionPayload = {},
  vehicle?: Pick<Vehicle, "currentOdometer">
): TransitionResult {
  const { status } = record;

  switch (action) {
    case TransitionAction.BOOK: {
      if (status !== ServiceStatus.DUE) {
        return {
          ok: false,
          reason: `Cannot book a record that is already ${status}.`,
        };
      }
      if (!payload.scheduledDate || !payload.technicianId) {
        return {
          ok: false,
          reason: "Booking requires a scheduledDate and at least one technician.",
        };
      }
      return {
        ok: true,
        patch: {
          status: ServiceStatus.BOOKED,
          scheduledDate: new Date(payload.scheduledDate),
        },
      };
    }

    case TransitionAction.START: {
      if (status !== ServiceStatus.BOOKED) {
        return {
          ok: false,
          reason: `Cannot start a record that is ${status}.`,
        };
      }
      return {
        ok: true,
        patch: {
          status: ServiceStatus.IN_SERVICE,
          startedAt: new Date(),
        },
      };
    }

    case TransitionAction.COMPLETE: {
      if (status !== ServiceStatus.IN_SERVICE) {
        return illegal(status, action);
      }
      if (payload.completedOdometer === undefined) {
        return {
          ok: false,
          reason: "Completing a service requires a completedOdometer reading.",
        };
      }
      if (vehicle && payload.completedOdometer < vehicle.currentOdometer) {
        return {
          ok: false,
          reason: `completedOdometer (${payload.completedOdometer}) cannot be lower than the vehicle's current odometer (${vehicle.currentOdometer}).`,
        };
      }
      return {
        ok: true,
        patch: {
          status: ServiceStatus.COMPLETED,
          completedAt: new Date(),
          completedOdometer: payload.completedOdometer,
        },
      };
    }
  }
}
