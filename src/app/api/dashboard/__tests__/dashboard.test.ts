import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ServiceStatus } from "@/generated/prisma/enums";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireRole: vi.fn(),
    auth: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    vehicle: { count: vi.fn() },
    serviceRecord: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    serviceAssignment: { groupBy: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const technicianSession = { user: { id: "u-tech", role: "TECHNICIAN" } };

/** Build the NextRequest the route reads X-Timezone from. */
function requestWithTimezone(timeZone?: string): NextRequest {
  return {
    headers: new Headers(timeZone ? { "x-timezone": timeZone } : {}),
  } as unknown as NextRequest;
}

/** Monday 00:00 local of the local calendar week containing `date`. */
function mondayOfWeekLocal(date: Date): Date {
  const day = (date.getDay() + 6) % 7; // Mon=0
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - day);
  return monday;
}

/** Monday 00:00 UTC of the UTC calendar week containing `date`. */
function mondayOfWeekUtc(date: Date): Date {
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

/** Monday 00:00 UTC of the given "YYYY-Www" ISO week key. */
function utcMondayOfWeekKey(weekKey: string): Date {
  const [year, week] = weekKey.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const result = new Date(mondayOfWeek1);
  result.setUTCDate(result.getUTCDate() + (week - 1) * 7);
  return result;
}

/** ISO week key in the given timezone (mirrors lib/local-week for assertions). */
function weekKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const localMidnight = new Date(get("year"), get("month") - 1, get("day"));
  const dow = (localMidnight.getDay() + 6) % 7;
  const monday = new Date(localMidnight);
  monday.setDate(monday.getDate() - dow);

  const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);
  const isoYear = d.getFullYear();
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  jan4.setDate(jan4.getDate() + 4 - jan4Day);
  const week =
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / 86400000 - 3 + (((jan4Day + 4) % 7) - 3)) / 7
    );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const allStatuses = Object.values(ServiceStatus);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
  vi.mocked(prisma.vehicle.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.serviceRecord.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.serviceRecord.groupBy).mockResolvedValue(
    allStatuses.map((status) => ({ status, _count: { _all: 0 } })) as never
  );
  vi.mocked(prisma.serviceAssignment.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([] as never);
});

describe("GET /api/dashboard", () => {
  it("returns completedPerWeek with exactly 8 entries when only 2 weeks have data", async () => {
    const now = new Date();
    const thisMonday = mondayOfWeekUtc(now); // default timezone is UTC

    // Data in the current UTC week and 5 weeks ago; the other 6 weeks are empty.
    const completedAt = [
      new Date(thisMonday.getTime() + 2 * 86400000), // current week
      new Date(thisMonday.getTime() + 3 * 86400000), // current week
      // 5 weeks ago: plain UTC-midnight Monday (unambiguous ISO week bucket).
      new Date(
        Date.UTC(
          thisMonday.getUTCFullYear(),
          thisMonday.getUTCMonth(),
          thisMonday.getUTCDate() - 5 * 7
        )
      ),
    ];
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue(
      completedAt.map((completedAt) => ({ completedAt })) as never
    );

    const res = await getDashboard(requestWithTimezone());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completedPerWeek).toHaveLength(8);
    expect(body.completedPerWeek[0].count).toBe(0);
    expect(body.completedPerWeek[2].count).toBe(1); // 5 weeks ago (this week is index 7)
    expect(body.completedPerWeek[7].count).toBe(2);

    // Oldest first, continuous weeks.
    for (let i = 1; i < body.completedPerWeek.length; i++) {
      const prev = body.completedPerWeek[i - 1];
      const curr = body.completedPerWeek[i];
      const diff =
        (utcMondayOfWeekKey(curr.week).getTime() -
          utcMondayOfWeekKey(prev.week).getTime()) /
        86400000;
      expect(diff).toBe(7);
    }

    // The two non-zero weeks match the mocked completions.
    const withData = body.completedPerWeek.filter((w: { count: number }) => w.count > 0);
    expect(withData).toHaveLength(2);
    expect(withData.map((w: { week: string }) => w.week)).toEqual([
      weekKeyInZone(new Date(thisMonday.getTime() - 5 * 7 * 86400000), "UTC"),
      weekKeyInZone(now, "UTC"),
    ]);
  });

  it("buckets weeks in the caller's timezone, not UTC", async () => {
    // Asia/Kolkata (UTC+5:30): this local week starts 5.5h earlier than the
    // UTC week. A completion 4h before UTC Monday belongs to the *previous*
    // local week in UTC but to the *current* local week in Asia/Kolkata.
    const now = new Date();
    const utcMonday = mondayOfWeekUtc(now);
    const boundary = new Date(utcMonday.getTime() - 4 * 3600000); // Sun 20:00 UTC
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      { completedAt: boundary },
    ] as never);

    const res = await getDashboard(requestWithTimezone("Asia/Kolkata"));

    expect(res.status).toBe(200);
    const body = await res.json();
    const currentKey = weekKeyInZone(now, "Asia/Kolkata");
    expect(body.completedPerWeek[7].week).toBe(currentKey);
    expect(body.completedPerWeek[7].count).toBe(1);
    // completedThisWeek (the DB count query) uses the same local window.
    expect(prisma.serviceRecord.count).toHaveBeenCalledWith({
      where: {
        status: ServiceStatus.COMPLETED,
        completedAt: { gte: expect.any(Date), lt: expect.any(Date) },
      },
    });
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await getDashboard(requestWithTimezone());

    expect(res.status).toBe(401);
    expect(prisma.vehicle.count).not.toHaveBeenCalled();
    expect(prisma.serviceRecord.groupBy).not.toHaveBeenCalled();
  });

  it("shapes byStatus with all four statuses zero-filled", async () => {
    vi.mocked(prisma.serviceRecord.groupBy).mockResolvedValue([
      { status: "IN_SERVICE", _count: { _all: 3 } },
    ] as never);

    const res = await getDashboard(requestWithTimezone());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byStatus).toEqual({
      DUE: 0,
      BOOKED: 0,
      IN_SERVICE: 3,
      COMPLETED: 0,
    });
  });

  describe("as a TECHNICIAN", () => {
    const technician = { id: "u-tech", name: "Tech One" };
    const vehicle = { id: "v1", registrationNumber: "AB12 CDE", make: "Ford", model: "Transit" };

    beforeEach(() => {
      vi.mocked(auth).mockResolvedValue(technicianSession as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(technician as never);
      vi.mocked(prisma.serviceAssignment.findMany).mockResolvedValue([] as never);
    });

    it("returns a technician-scoped payload (not fleet-wide stats)", async () => {
      const res = await getDashboard(requestWithTimezone());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.role).toBe("TECHNICIAN");
      expect(body.technician).toEqual(technician);
      expect(body.stats.assignedCount).toBe(0);
      expect(body.assigned).toEqual([]);
      expect(body.recentCompleted).toEqual([]);
      // Fleet-wide aggregates must not be present.
      expect(body).not.toHaveProperty("dueCount");
      expect(body).not.toHaveProperty("byStatus");
    });

    it("buckets only the caller's own assignments", async () => {
      const now = new Date();
      const thisMonday = mondayOfWeekLocal(now);
      const inService = {
        id: "r-active",
        status: "IN_SERVICE",
        description: "Suspension check",
        scheduledDate: null,
        startedAt: now,
        dueSince: now,
        vehicle,
      };
      const completed = {
        id: "r-done",
        status: "COMPLETED",
        description: "Full service",
        scheduledDate: null,
        startedAt: null,
        dueSince: now,
        completedAt: new Date(thisMonday.getTime() + 86400000), // this week
        completedOdometer: 12345,
        vehicle,
      };
      vi.mocked(prisma.serviceAssignment.findMany).mockImplementation(
        (async ({ where }: { where?: { unassignedAt?: unknown } } = {}) => {
          if (where?.unassignedAt === null) {
            // Active assignments (the route uses { unassignedAt: null }).
            return [{ serviceRecord: inService }] as never;
          }
          // Closed assignments.
          return [{ serviceRecord: completed }] as never;
        }) as never
      );

      const res = await getDashboard(requestWithTimezone("UTC"));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stats.assignedCount).toBe(1);
      expect(body.stats.inServiceCount).toBe(1);
      expect(body.stats.completedThisWeek).toBe(1);
      expect(body.stats.completedAllTime).toBe(1);
      expect(body.assigned[0].id).toBe("r-active");
      expect(body.recentCompleted[0].id).toBe("r-done");
    });
  });
});
