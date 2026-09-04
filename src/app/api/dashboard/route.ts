import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { isOverdue } from "@/lib/overdue";
import { Role, ServiceStatus } from "@/generated/prisma/enums";

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

/** Shared vehicle projection for technician dashboard rows. */
const TECH_VEHICLE_SELECT = {
  select: {
    id: true,
    registrationNumber: true,
    make: true,
    model: true,
  },
} as const;

/**
 * GET /api/dashboard for a TECHNICIAN caller — only their own work.
 * Returns their active assignments, headline stats over those assignments,
 * and their recent completions. Managers/admins get the fleet-wide payload
 * (the original function below).
 */
async function technicianDashboard(userId: string) {
  const [me, activeAssignments, closedAssignments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    }),
    prisma.serviceAssignment.findMany({
      where: { technicianId: userId, unassignedAt: null },
      select: {
        serviceRecord: {
          select: {
            id: true,
            status: true,
            description: true,
            scheduledDate: true,
            startedAt: true,
            dueSince: true,
            vehicle: TECH_VEHICLE_SELECT,
          },
        },
      },
      orderBy: { assignedAt: "asc" },
    }),
    prisma.serviceAssignment.findMany({
      where: { technicianId: userId, unassignedAt: { not: null } },
      select: {
        serviceRecord: {
          select: {
            id: true,
            status: true,
            description: true,
            completedAt: true,
            completedOdometer: true,
            vehicle: TECH_VEHICLE_SELECT,
          },
        },
      },
    }),
  ]);

  if (!me) {
    throw new Error("Technician user not found.");
  }

  const assigned = activeAssignments.map(({ serviceRecord }) => ({
    id: serviceRecord.id,
    status: serviceRecord.status,
    description: serviceRecord.description,
    scheduledDate: serviceRecord.scheduledDate,
    startedAt: serviceRecord.startedAt,
    dueSince: serviceRecord.dueSince,
    vehicle: serviceRecord.vehicle,
  }));

  // "My completions" = closed assignments whose record is COMPLETED. A closed
  // assignment on a non-completed record (e.g. manager reassigned mid-job)
  // is not a completion.
  const completions = closedAssignments
    .map(({ serviceRecord }) => serviceRecord)
    .filter(
      (r): r is typeof r & { completedAt: Date } =>
        r.status === ServiceStatus.COMPLETED && r.completedAt !== null
    );

  const now = new Date();
  const weekStart = startOfIsoWeek(isoWeekKey(now));
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  const dueCount = assigned.filter((r) => {
    if (r.status !== ServiceStatus.DUE) return false;
    return isOverdue({ status: r.status, dueSince: new Date(r.dueSince) });
  }).length;
  const inServiceCount = assigned.filter(
    (r) => r.status === ServiceStatus.IN_SERVICE
  ).length;
  const completedThisWeek = completions.filter((r) => {
    const at = r.completedAt;
    return at >= weekStart && at < nextWeekStart;
  }).length;

  const recentCompleted = completions
    .slice()
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      description: r.description,
      completedAt: r.completedAt.toISOString(),
      completedOdometer: r.completedOdometer,
      vehicle: r.vehicle,
    }));

  return {
    role: Role.TECHNICIAN,
    technician: { id: me.id, name: me.name },
    assigned,
    stats: {
      assignedCount: assigned.length,
      dueCount,
      inServiceCount,
      completedThisWeek,
      completedAllTime: completions.length,
    },
    recentCompleted,
  };
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

    // Technicians get a personal dashboard scoped to their own assignments,
    // not the fleet-wide numbers.
    if (session.user.role === Role.TECHNICIAN) {
      return NextResponse.json(await technicianDashboard(session.user.id));
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
