import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError, NotFoundError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// POST /api/alerts/[id]/dismiss — FLEET_MANAGER only.
// Dismissing only stamps the alert row (dismissedAt + who did it); the row is
// never deleted, so the timeline of "this alert existed and was dismissed"
// survives. The unique [vehicleId, serviceCycle] constraint means dismissing
// cycle N's alert has no effect on the next cycle's alert.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(Role.FLEET_MANAGER);

    const { id } = await params;
    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundError("Alert not found.");

    if (alert.dismissedAt) {
      // Idempotent: dismissing an already-dismissed alert is a no-op that
      // still reports success.
      return NextResponse.json(alert);
    }

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        dismissedAt: new Date(),
        dismissedById: session.user.id,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleError(error);
  }
}
