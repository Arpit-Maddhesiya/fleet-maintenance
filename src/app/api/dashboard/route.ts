import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { isOverdue } from "@/lib/overdue";
import { ServiceStatus } from "@/generated/prisma/enums";

/** ISO week: Monday-based, matching Date.prototype.toISOString (UTC). */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to Thursday of this week
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() + 4 - jan4Day); // Thursday of ISO week 1
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4Day + 4) % 7 - 3)) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** UTC midnight on the Monday that starts the given ISO week. */
function startOfIsoWeek(weekKey: string): Date {
  const [year, week] = weekKey.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const result = new Date(mondayOfWeek1);
  result.setUTCDate(result.getUTCDate() + (week - 1) * 7);
  return result;
}

// GET /api/dashboard — any authenticated user. All aggregates run
// concurrently via Promise.all; the response is assembled from their results.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const now = new Date();
    const weekStart = startOfIsoWeek(isoWeekKey(now)); // Monday 00:00 UTC this week
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

    const last8Keys = Array.from({ length: 8 }, (_, i) => {
      const d = new Date(weekStart);
      d.setUTCDate(d.getUTCDate() + (i - 7) * 7); // i=0 -> 7 weeks ago ... i=7 -> this week
      return isoWeekKey(d);
    });

    const [
      dueCount,
      inServiceCount,
      completedThisWeek,
      overdueCount,
      byStatus,
      byTechnician,
      completedRecords,
    ] = await Promise.all([
      // Vehicles with a DUE record that hasn't been completed-and-reopened
      // since — "active" means the DUE record is still this vehicle's current
      // service cycle (see service-lifecycle for how completion re-opens).
      prisma.vehicle.count({
        where: {
          serviceRecords: {
            some: { status: ServiceStatus.DUE },
          },
        },
      }),
      prisma.serviceRecord.count({
        where: { status: ServiceStatus.IN_SERVICE },
      }),
      prisma.serviceRecord.count({
        where: {
          status: ServiceStatus.COMPLETED,
          completedAt: { gte: weekStart, lt: nextWeekStart },
        },
      }),
      // Overdue count uses the shared isOverdue() definition (DUE + past the
      // grace period) rather than re-expressing the cutoff here.
      prisma.serviceRecord
        .findMany({
          where: { status: ServiceStatus.DUE },
          select: { dueSince: true, status: true },
        })
        .then((dueRecords) => dueRecords.filter(isOverdue).length),
      prisma.serviceRecord.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.serviceAssignment.groupBy({
        by: ["technicianId"],
        where: { unassignedAt: null },
        _count: { _all: true },
      }),
      // Only completedAt is needed to bucket by week.
      prisma.serviceRecord.findMany({
        where: { status: ServiceStatus.COMPLETED },
        select: { completedAt: true },
      }),
    ]);

    const byStatusObject = Object.fromEntries(
      byStatus.map((g) => [g.status, g._count._all])
    );
    // Always expose every status so the frontend doesn't have to default.
    (Object.keys(ServiceStatus) as ServiceStatus[]).forEach((s) => {
      byStatusObject[s] ??= 0;
    });

    const byTechnicianObject = Object.fromEntries(
      byTechnician.map((g) => [g.technicianId, g._count._all])
    );

    const countsByWeek = new Map(last8Keys.map((k) => [k, 0]));
    for (const { completedAt } of completedRecords) {
      if (!completedAt) continue;
      const key = isoWeekKey(completedAt);
      if (countsByWeek.has(key)) countsByWeek.set(key, countsByWeek.get(key)! + 1);
    }
    const completedPerWeek = last8Keys.map((key) => ({
      week: key,
      count: countsByWeek.get(key)!,
    }));

    return NextResponse.json({
      dueCount,
      inServiceCount,
      completedThisWeek,
      overdueCount,
      byStatus: byStatusObject,
      byTechnician: byTechnicianObject,
      completedPerWeek,
    });
  } catch (error) {
    return handleError(error);
  }
}
