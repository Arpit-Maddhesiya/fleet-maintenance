import { NextResponse, type NextRequest } from "next/server";
import { auth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createServiceRecordSchema,
  listServiceRecordsQuerySchema,
} from "@/lib/validation/service-record";
import { handleError } from "@/lib/api";
import { Role, HistoryEventType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

// GET /api/service-records — any authenticated user. The single list endpoint
// for the whole app: server-side search/filter/sort/pagination, all expressed
// in the Prisma query (no fetch-everything-and-filter-in-JS).
//
// A TECHNICIAN caller is silently scoped to records they are actively assigned
// to — their technicianId filter is overridden, never applied as-is, so a
// technician can't query someone else's records by manipulating the query.
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
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortDir: searchParams.get("sortDir") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      q,
      vehicleId,
      status,
      technicianId,
      sortBy = "updatedAt",
      sortDir = "desc",
      page,
      pageSize,
    } = parsed.data;

    const where: Prisma.ServiceRecordWhereInput = {
      ...(q ? { description: { contains: q, mode: "insensitive" } } : {}),
      ...(vehicleId ? { vehicleId } : {}),
      ...(status ? { status } : {}),
      // A technician can only ever see their own active assignments; anyone
      // else (fleet manager) may filter by any technician.
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

    const orderBy = { [sortBy]: sortDir };
    const [data, total] = await Promise.all([
      prisma.serviceRecord.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        // The list UI shows vehicle registration and the currently assigned
        // technicians, so include the relations instead of returning bare rows.
        include: {
          vehicle: { select: { registrationNumber: true } },
          assignments: {
            where: { unassignedAt: null },
            include: { technician: { select: { name: true } } },
          },
        },
      }),
      prisma.serviceRecord.count({ where }),
    ]);

    return NextResponse.json({ data, total, page, pageSize });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/service-records — FLEET_MANAGER only
// A record starts life as DUE with dueSince = now; booking (scheduling +
// assigning a technician) is a separate lifecycle step.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(Role.FLEET_MANAGER);

    const body = await request.json();
    const parsed = createServiceRecordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: parsed.data.vehicleId },
    });
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const record = await prisma.serviceRecord.create({
      data: {
        vehicleId: vehicle.id,
        description: parsed.data.description,
        status: "DUE",
        dueSince: new Date(),
        historyEvents: {
          create: {
            type: HistoryEventType.CREATED,
            actorId: session.user.id,
          },
        },
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
