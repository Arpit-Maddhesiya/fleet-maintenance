import { NextResponse, type NextRequest } from "next/server";
import { auth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createVehicleSchema } from "@/lib/validation/vehicle";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// POST /api/vehicles — FLEET_MANAGER only
export async function POST(request: NextRequest) {
  try {
    await requireRole(Role.FLEET_MANAGER);

    const body = await request.json();
    const parsed = createVehicleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        ...parsed.data,
        // A brand-new vehicle is considered "just serviced": the intervals
        // start counting from today and its current odometer reading.
        lastServiceDate: new Date(),
        lastServiceOdometer: parsed.data.currentOdometer,
        serviceCycle: 1,
      },
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

// GET /api/vehicles — any authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";

    const vehicles = await prisma.vehicle.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(vehicles);
  } catch (error) {
    return handleError(error);
  }
}
