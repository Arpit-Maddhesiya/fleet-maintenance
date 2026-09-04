import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError, NotFoundError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// GET /api/technicians/[id]/service-records — any authenticated user
// Returns every ServiceRecord (with vehicle info) this technician has ever
// been assigned to — both their active jobs (unassignedAt = null) and their
// completed history (closed assignments). A technician caller may only request
// their own list — a technician asking for another technician's records gets
// 403. This powers the "My Records" page, which is a technician's complete
// work history now that the fleet-wide Service Records list is manager-only.
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

    // Admins and fleet managers may view any technician's list; a technician
    // may only view their own.
    const self = session.user.role === Role.TECHNICIAN ? session.user.id : null;
    if (self && self !== id) {
      return NextResponse.json(
        { error: "You can only view your own service records." },
        { status: 403 }
      );
    }

    const technician = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!technician) throw new NotFoundError("Technician not found.");
    if (technician.role !== Role.TECHNICIAN) {
      return NextResponse.json(
        { error: "Service records can only be listed for technicians." },
        { status: 400 }
      );
    }

    const serviceRecords = await prisma.serviceRecord.findMany({
      where: {
        assignments: {
          some: {
            technicianId: technician.id,
            // Any assignment — active or closed. A technician's "My Records"
            // is their full work history (current jobs + completed jobs).
          },
        },
      },
      include: { vehicle: true },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(serviceRecords);
  } catch (error) {
    return handleError(error);
  }
}
