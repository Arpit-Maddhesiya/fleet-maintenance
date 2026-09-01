import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// GET /api/technicians — any authenticated user. Returns every technician
// (id + name) for filter dropdowns. Technicians don't see the manager-only
// filter in the UI, so this is primarily for FLEET_MANAGER pages, but the
// endpoint itself is not role-restricted.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const technicians = await prisma.user.findMany({
      where: { role: Role.TECHNICIAN },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(technicians);
  } catch (error) {
    return handleError(error);
  }
}
