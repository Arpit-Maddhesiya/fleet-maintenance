import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createServiceRecordSchema } from "@/lib/validation/service-record";
import { handleError } from "@/lib/api";
import { Role, HistoryEventType } from "@/generated/prisma/enums";

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
