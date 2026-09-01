import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listServiceRecordsQuerySchema } from "@/lib/validation/service-record";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// GET /api/service-records/export — any authenticated user
// Same authorization + filters as the list endpoint (Module 5): a technician
// is scoped to their own active assignments, a manager sees everything and
// may filter by the list query params. Streams back a CSV attachment.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const parsed = listServiceRecordsQuerySchema.safeParse({
      q: searchParams.get("q") ?? undefined,
      vehicleId: searchParams.get("vehicleId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      technicianId: searchParams.get("technicianId") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { q, vehicleId, status, technicianId } = parsed.data;

    const where: Prisma.ServiceRecordWhereInput = {
      ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(status ? { status } : {}),
      // Same technician scoping as the list endpoint: a technician's id wins
      // over any technicianId filter they pass.
      ...(technicianId || session.user.role === Role.TECHNICIAN
        ? {
            assignments: {
              some: {
                technicianId:
                  session.user.role === Role.TECHNICIAN
                    ? session.user.id
                    : technicianId,
                unassignedAt: null,
              },
            },
          }
        : {}),
    };

    const records = await prisma.serviceRecord.findMany({
      where,
      include: { vehicle: true },
      orderBy: { updatedAt: "desc" },
    });

    const header = [
      "vehicleRegistration",
      "vehicleMakeModel",
      "description",
      "status",
      "scheduledDate",
      "completedAt",
    ];
    const rows = records.map((record) => [
      escapeCsv(record.vehicle.registrationNumber),
      escapeCsv(`${record.vehicle.make} ${record.vehicle.model}`),
      escapeCsv(record.description),
      escapeCsv(record.status),
      record.scheduledDate ? escapeCsv(record.scheduledDate.toISOString()) : "",
      record.completedAt ? escapeCsv(record.completedAt.toISOString()) : "",
    ]);

    const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="service-records.csv"',
      },
    });
  } catch (error) {
    return handleError(error);
  }
}
