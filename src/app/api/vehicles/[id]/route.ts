import { NextResponse, type NextRequest } from "next/server";
import { auth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateVehicleSchema } from "@/lib/validation/vehicle";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// GET /api/vehicles/[id] — any authenticated user, includes service history
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
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        serviceRecords: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    return NextResponse.json(vehicle);
  } catch (error) {
    return handleError(error);
  }
}

// PATCH /api/vehicles/[id] — FLEET_MANAGER only
// NOTE: currentOdometer is intentionally not editable here — updating a
// vehicle's odometer is handled separately (bulk CSV update + a dedicated
// reading endpoint later), and readings must never be lowered.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(Role.FLEET_MANAGER);

    const { id } = await params;
    const body = await request.json();
    const parsed = updateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(vehicle);
  } catch (error) {
    return handleError(error);
  }
}
