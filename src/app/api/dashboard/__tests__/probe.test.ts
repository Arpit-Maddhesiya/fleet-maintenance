import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

function mondayOfWeek(date: Date): Date {
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - (day - 1));
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
  vi.mocked(prisma.vehicle.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.serviceRecord.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.serviceRecord.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.serviceAssignment.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([] as never);
});

describe("probe", () => {
  it("dumps completedPerWeek keys", async () => {
    const now = new Date();
    const thisMonday = mondayOfWeek(now);
    const completedAt = [
      new Date(thisMonday.getTime() + 2 * 86400000),
      new Date(thisMonday.getTime() + 3 * 86400000),
      new Date(thisMonday.getTime() - 5 * 7 * 86400000),
    ];
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue(
      completedAt.map((completedAt) => ({ completedAt })) as never
    );

    const res = await getDashboard();
    const body = await res.json();
    console.log("NOW", now.toISOString());
    console.log("MONDAY", thisMonday.toISOString());
    console.log(
      "WEEKS",
      body.completedPerWeek.map(
        (w: { week: string; count: number }) => `${w.week}:${w.count}`
      )
    );
    console.log(
      "5wk-ago week key",
      isoWeekKeyForProbe(new Date(thisMonday.getTime() - 5 * 7 * 86400000))
    );
  });
});

function isoWeekKeyForProbe(date: Date): string {
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
