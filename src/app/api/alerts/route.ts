import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { isOverdue } from "@/lib/overdue";
import { ServiceStatus } from "@/generated/prisma/enums";

// GET /api/alerts — any authenticated user.
//
// Alert rows are created lazily: on every read we find every vehicle that is
// currently overdue (DUE past the grace period) and make sure an Alert exists
// for its current service cycle. The unique constraint on [vehicleId,
// serviceCycle] is what powers the reappearance rule — dismissing cycle N's
// alert does nothing to suppress a brand-new alert for cycle N+1, because that
// is a different row (the cycle increments when the service completes).
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const dueRecords = await prisma.serviceRecord.findMany({
      where: { status: ServiceStatus.DUE },
      include: {
        vehicle: { select: { id: true, serviceCycle: true } },
      },
    });

    // One alert per vehicle per cycle; collapse the overdue records onto
    // distinct {vehicleId, serviceCycle} pairs before creating anything.
    const pairs = new Map<string, { vehicleId: string; serviceCycle: number }>();
    for (const record of dueRecords) {
      if (!isOverdue(record)) continue;
      pairs.set(`${record.vehicleId}:${record.vehicle.serviceCycle}`, {
        vehicleId: record.vehicleId,
        serviceCycle: record.vehicle.serviceCycle,
      });
    }

    if (pairs.size > 0) {
      // skipDuplicates: an alert that already exists for this cycle (dismissed
      // or not) is left untouched — never re-triggered, never resurrected.
      await prisma.alert.createMany({
        data: [...pairs.values()],
        skipDuplicates: true,
      });
    }

    const active = await prisma.alert.findMany({
      where: { dismissedAt: null },
      include: { vehicle: true },
      orderBy: { triggeredAt: "asc" },
    });

    // Only alerts for the vehicle's *current* cycle are live. An alert from an
    // earlier cycle goes quiet once the service completes and the cycle moves
    // on, even if it was never dismissed.
    const alerts = active.filter(
      (alert) => alert.serviceCycle === alert.vehicle.serviceCycle
    );

    return NextResponse.json({ alerts, count: alerts.length });
  } catch (error) {
    return handleError(error);
  }
}
