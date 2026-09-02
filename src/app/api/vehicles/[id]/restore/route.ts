import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// POST /api/vehicles/[id]/restore — FLEET_MANAGER or ADMIN only
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(Role.FLEET_MANAGER);

    const { id } = await params;
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: { archivedAt: null },
    });

    return NextResponse.json(vehicle);
  } catch (error) {
    return handleError(error);
  }
}
