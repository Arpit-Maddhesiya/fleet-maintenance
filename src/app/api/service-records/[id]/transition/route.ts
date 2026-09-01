import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { transitionSchema } from "@/lib/validation/service-record";
import { handleError, NotFoundError } from "@/lib/api";
import { transition } from "@/lib/service-lifecycle";
import {
  Role,
  HistoryEventType,
  ServiceStatus,
} from "@/generated/prisma/enums";

// POST /api/service-records/[id]/transition — BOOK/START/COMPLETE
//
// The state machine rules (which statuses may move where, what payload each
// move needs) live in lib/service-lifecycle.ts; this handler is the only
// thing that touches the database, and it does so inside a single transaction
// so the record update, the vehicle counters, and the history event are
// committed together or not at all.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(Role.FLEET_MANAGER);

    const { id } = await params;
    const body = await request.json();
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { action } = parsed.data;
    const payload =
      action === "BOOK"
        ? { scheduledDate: parsed.data.scheduledDate, technicianId: parsed.data.technicianId }
        : action === "COMPLETE"
          ? { completedOdometer: parsed.data.completedOdometer }
          : {};

    const record = await prisma.serviceRecord.findUnique({
      where: { id },
      include: { vehicle: true, assignments: true },
    });
    if (!record) throw new NotFoundError("Service record not found.");

    // START and COMPLETE may be performed by the fleet manager, or by a
    // technician the record is currently assigned to. BOOK is manager-only
    // (checked above). Anyone else is rejected before the state machine runs.
    if (action !== "BOOK" && session.user.role !== Role.FLEET_MANAGER) {
      const isAssigned = record.assignments.some(
        (a) => a.technicianId === session.user.id && a.unassignedAt === null
      );
      if (!isAssigned) {
        return NextResponse.json(
          { error: "You are not assigned to this service record." },
          { status: 403 }
        );
      }
    }

    const result = transition(record, action, payload, record.vehicle);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }

    const now = new Date();

    const updatedRecord = await prisma.$transaction(async (tx) => {
      // The record itself moves state (e.g. IN_SERVICE -> COMPLETED with the
      // completion timestamp and odometer reading).
      const updated = await tx.serviceRecord.update({
        where: { id: record.id },
        data: result.patch,
      });

      if (action === "COMPLETE") {
        // Completing a service resets both counters on the vehicle: the
        // odometer advances to the completion reading, the "last serviced"
        // markers move to now, and the service cycle increments. This must be
        // atomic with the record update above.
        await tx.vehicle.update({
          where: { id: record.vehicleId },
          data: {
            currentOdometer: updated.completedOdometer!,
            lastServiceDate: now,
            lastServiceOdometer: updated.completedOdometer!,
            serviceCycle: { increment: 1 },
          },
        });
      }

      if (action === "BOOK") {
        // Assigning a technician is part of booking; record the active
        // assignment so START/COMPLETE can be authorized against it.
        await tx.serviceAssignment.create({
          data: {
            serviceRecordId: record.id,
            technicianId: payload.technicianId!,
          },
        });
        // Booking also assigns a technician, so the audit trail gets an
        // ASSIGNED event naming them (not just the STATUS_CHANGE below).
        await tx.serviceHistoryEvent.create({
          data: {
            serviceRecordId: record.id,
            type: HistoryEventType.ASSIGNED,
            actorId: session.user.id,
            technicianId: payload.technicianId!,
          },
        });
      }

      // Every state change gets an audit trail entry.
      await tx.serviceHistoryEvent.create({
        data: {
          serviceRecordId: record.id,
          type: HistoryEventType.STATUS_CHANGE,
          fromStatus: record.status as ServiceStatus,
          toStatus: updated.status as ServiceStatus,
          actorId: session.user.id,
        },
      });

      return updated;
    });

    return NextResponse.json(updatedRecord);
  } catch (error) {
    return handleError(error);
  }
}
