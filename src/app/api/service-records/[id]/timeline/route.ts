import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError, NotFoundError } from "@/lib/api";
import { Role, HistoryEventType, ServiceStatus } from "@/generated/prisma/enums";
import type { ServiceHistoryEventModel } from "@/generated/prisma/models";

function formatStatus(status: ServiceStatus | null): string | null {
  return status ?? null;
}

/**
 * Builds a human-readable summary for a single history event. The actor's name
 * is always resolved (joined, not just actorId), and ASSIGNED/UNASSIGNED events
 * include the technician's name captured on the event itself.
 */
export function summarizeEvent(
  event: ServiceHistoryEventModel & {
    actor: { name: string; role: Role };
    technician: { name: string } | null;
  }
): string {
  const actorName = event.actor.name;

  switch (event.type) {
    case HistoryEventType.CREATED:
      return "Record created";
    case HistoryEventType.STATUS_CHANGE:
      return `Status changed from ${formatStatus(event.fromStatus)} to ${formatStatus(event.toStatus)}`;
    case HistoryEventType.ASSIGNED:
      return event.technician
        ? `${actorName} assigned ${event.technician.name}`
        : `${actorName} assigned a technician`;
    case HistoryEventType.UNASSIGNED:
      return event.technician
        ? `${actorName} unassigned ${event.technician.name}`
        : `${actorName} unassigned a technician`;
    case HistoryEventType.NOTE:
      return event.note ? `Note: ${event.note}` : `${actorName} added a note`;
    default:
      return `${actorName} ${event.type}`;
  }
}

// GET /api/service-records/[id]/timeline — any authenticated user who can see
// the record. Technician callers are scoped to records they're actively
// assigned to (same rule as Module 5's list endpoint); a fleet manager can
// fetch any. Returns events oldest-first with actor + technician resolved.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const record = await prisma.serviceRecord.findUnique({
      where: { id },
      include: { assignments: true },
    });
    if (!record) throw new NotFoundError("Service record not found.");

    if (session.user.role !== Role.FLEET_MANAGER) {
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

    const events = await prisma.serviceHistoryEvent.findMany({
      where: { serviceRecordId: record.id },
      orderBy: { createdAt: "asc" },
      include: {
        actor: { select: { name: true, role: true } },
        technician: { select: { name: true } },
      },
    });

    const timeline = events.map((event) => ({
      id: event.id,
      type: event.type,
      createdAt: event.createdAt,
      actor: {
        id: event.actorId,
        name: event.actor.name,
        role: event.actor.role,
      },
      technician: event.technician ? { name: event.technician.name } : null,
      summary: summarizeEvent(event),
    }));

    return NextResponse.json(timeline);
  } catch (error) {
    return handleError(error);
  }
}
