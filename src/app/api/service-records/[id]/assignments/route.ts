import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createAssignmentSchema } from "@/lib/validation/service-record";
import { handleError, NotFoundError } from "@/lib/api";
import { Role, HistoryEventType } from "@/generated/prisma/enums";

// POST /api/service-records/[id]/assignments — FLEET_MANAGER only
// Adds a technician to a record after booking. A technician with an active
// (unassignedAt = null) assignment to this record cannot be added again — the
// assignment is soft-removed (UNASSIGNED) rather than deleted so history is
// preserved, but re-adding requires an explicit unassign first.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(Role.FLEET_MANAGER);

    const { id } = await params;
    const body = await request.json();
    const parsed = createAssignmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const record = await prisma.serviceRecord.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!record) throw new NotFoundError("Service record not found.");

    const technician = await prisma.user.findUnique({
      where: { id: parsed.data.technicianId },
      select: { id: true, role: true },
    });
    if (!technician) {
      return NextResponse.json(
        { error: "Technician not found." },
        { status: 404 }
      );
    }
    if (technician.role !== Role.TECHNICIAN) {
      return NextResponse.json(
        { error: "Assignments can only be created for technicians." },
        { status: 400 }
      );
    }

    const existingActive = await prisma.serviceAssignment.findFirst({
      where: {
        serviceRecordId: record.id,
        technicianId: technician.id,
        unassignedAt: null,
      },
    });
    if (existingActive) {
      return NextResponse.json(
        { error: "This technician is already assigned to this service record." },
        { status: 409 }
      );
    }

    const assignment = await prisma.$transaction(async (tx) => {
      const created = await tx.serviceAssignment.create({
        data: {
          serviceRecordId: record.id,
          technicianId: technician.id,
        },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRecordId: record.id,
          type: HistoryEventType.ASSIGNED,
          actorId: session.user.id,
        },
      });

      return created;
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
