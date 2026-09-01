import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ServiceStatus } from "@/generated/prisma/enums";

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
    serviceAssignment: { groupBy: vi.fn() },
  },
}));

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };

/** Monday 00:00 UTC of the ISO week containing `date` (same logic as the route). */
function mondayOfWeek(date: Date): Date {
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() + 4 - jan4Day);
  const week =
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / 86400000 - 3 + (((jan4Day + 4) % 7) - 3)) / 7
    );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** UTC-midnight Monday of the given ISO week key (V8 rejects "YYYY-Www" date strings). */
function mondayOfIsoWeek(weekKey: string): Date {
  const [year, week] = weekKey.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const result = new Date(mondayOfWeek1);
  result.setUTCDate(result.getUTCDate() + (week - 1) * 7);
  return result;
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
    const thisMonday = mondayOfWeek(now);

    // Data in the current week and 5 weeks ago; the other 6 weeks are empty.
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

    const res = await getDashboard();

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
        (mondayOfIsoWeek(curr.week).getTime() -
          mondayOfIsoWeek(prev.week).getTime()) /
        86400000;
      expect(diff).toBe(7);
    }

    // The two non-zero weeks match the mocked completions.
    const withData = body.completedPerWeek.filter((w: { count: number }) => w.count > 0);
    expect(withData).toHaveLength(2);
    expect(withData.map((w: { week: string }) => w.week)).toEqual([
      isoWeekKey(new Date(thisMonday.getTime() - 5 * 7 * 86400000)),
      isoWeekKey(now),
    ]);
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await getDashboard();

    expect(res.status).toBe(401);
    expect(prisma.vehicle.count).not.toHaveBeenCalled();
    expect(prisma.serviceRecord.groupBy).not.toHaveBeenCalled();
  });

  it("shapes byStatus with all four statuses zero-filled", async () => {
    vi.mocked(prisma.serviceRecord.groupBy).mockResolvedValue([
      { status: "IN_SERVICE", _count: { _all: 3 } },
    ] as never);

    const res = await getDashboard();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byStatus).toEqual({
      DUE: 0,
      BOOKED: 0,
      IN_SERVICE: 3,
      COMPLETED: 0,
    });
  });
});
