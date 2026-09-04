import { NextResponse, type NextRequest } from "next/server";
import { auth, isManagerRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateServiceRecordDescriptionSchema } from "@/lib/validation/service-record";
import { handleError, NotFoundError } from "@/lib/api";

// GET /api/service-records/[id] — any authenticated user who can see the
// record. A technician may view a record they are (or were) assigned to — both
// their active jobs and their completed history. A fleet manager or admin can
// fetch any. Returns the record with its vehicle and currently assigned
// technicians, so the detail page renders without follow-up requests.
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
      include: {
        vehicle: true,
        assignments: {
          include: { technician: { select: { id: true, name: true } } },
        },
      },
    });
    if (!record) throw new NotFoundError("Service record not found.");

    // Same scoping rule as the list endpoint and the timeline: a technician
    // can view records they are assigned to — including closed assignments so
    // they can revisit their own completed work.
    if (!isManagerRole(session.user.role)) {
      const isAssigned = record.assignments.some(
        (a) => a.technicianId === session.user.id
      );
      if (!isAssigned) {
        return NextResponse.json(
          { error: "You are not assigned to this service record." },
          { status: 403 }
        );
      }
    }

    // Only currently-active technicians are part of the response shape (the
    // detail page lists who is assigned now); closed assignments were used
    // above purely to authorize a technician viewing their own history.
    return NextResponse.json({
      ...record,
      assignments: record.assignments.filter((a) => a.unassignedAt === null),
    });
  } catch (error) {
    return handleError(error);
  }
}

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

    if (!isManagerRole(session.user.role)) {
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
