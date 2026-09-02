import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError, NotFoundError } from "@/lib/api";
import { Role, HistoryEventType } from "@/generated/prisma/enums";

// DELETE /api/service-records/[id]/assignments/[assignmentId] — FLEET_MANAGER
// or ADMIN only
// Soft-removes an assignment: sets unassignedAt = now instead of deleting the
// row, so the assignment stays in the audit history. The record itself is not
// touched, and the endpoint is idempotent — unassigning an already-unassigned
// assignment is a no-op success (the history is preserved either way).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  try {
    const session = await requireRole(Role.FLEET_MANAGER);

    const { id, assignmentId } = await params;
    const record = await prisma.serviceRecord.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!record) throw new NotFoundError("Service record not found.");

    const assignment = await prisma.serviceAssignment.findFirst({
      where: { id: assignmentId, serviceRecordId: record.id },
      select: { id: true, unassignedAt: true },
    });
    if (!assignment) {
      throw new NotFoundError("Assignment not found.");
    }
    if (assignment.unassignedAt !== null) {
      // Already unassigned — nothing to do, but not an error (idempotent).
      return NextResponse.json({ ok: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.serviceAssignment.update({
        where: { id: assignment.id },
        data: { unassignedAt: new Date() },
      });

      await tx.serviceHistoryEvent.create({
        data: {
          serviceRecordId: record.id,
          type: HistoryEventType.UNASSIGNED,
          actorId: session.user.id,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
