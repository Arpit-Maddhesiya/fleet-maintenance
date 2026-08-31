import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateServiceRecordDescriptionSchema } from "@/lib/validation/service-record";
import { handleError, NotFoundError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// PATCH /api/service-records/[id] — FLEET_MANAGER, or a technician with an
// active assignment to this record. Only the description is editable here.
// An assigned technician may update the description of their own record, but
// this is deliberately NOT a path to reassignment — assignment changes are
// fleet-manager-only (POST/DELETE under /assignments).
export async function PATCH(
  request: NextRequest,
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
    const body = await request.json();
    const parsed = updateServiceRecordDescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

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

    const updated = await prisma.serviceRecord.update({
      where: { id: record.id },
      data: { description: parsed.data.description },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleError(error);
  }
}
