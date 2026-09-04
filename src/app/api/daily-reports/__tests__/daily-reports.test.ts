import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET as getDailyReports, POST as postDailyReport } from "@/app/api/daily-reports/route";
import { auth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";
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
    dailyReport: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

const technicianSession = { user: { id: "u-tech", name: "Tech One", role: Role.TECHNICIAN } };
const managerSession = { user: { id: "u-manager", name: "Fleet Manager", role: Role.FLEET_MANAGER } };
const adminSession = { user: { id: "u-admin", name: "Administrator", role: Role.ADMIN } };

const REPORTED_AT = {
  // A Thursday 2026-09-03 17:30 UTC. In Asia/Kolkata (UTC+5:30) that is
  // 23:00 local — safely after 5 PM. In UTC it is also after 5 PM. In
  // America/New_York (EDT, UTC-4) it is 13:30 local — before 5 PM.
  afterIstAndUtc: new Date("2026-09-03T17:30:00.000Z"),
  // New York 2026-01-15 22:00Z = 17:00 EST exactly (allowed).
  nyAtOpen: new Date("2026-01-15T22:00:00.000Z"),
  // New York 2026-01-15 21:59Z = 16:59 EST (blocked).
  nyBeforeOpen: new Date("2026-01-15T21:59:00.000Z"),
};

function requestFor(
  timeZone?: string,
  query = "",
  body?: Record<string, unknown>
): NextRequest {
  const req = new Request(
    `http://localhost/api/daily-reports${query ? `?${query}` : ""}`,
    {
      method: body ? "POST" : "GET",
      headers: timeZone ? { "x-timezone": timeZone } : {},
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  return Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest;
}

const techUser = { id: "u-tech", name: "Tech One", role: Role.TECHNICIAN };
const managerUser = { id: "u-manager", name: "Fleet Manager", role: Role.FLEET_MANAGER };

const fakeReportRow = {
  id: "dr-1",
  authorId: "u-tech",
  author: { id: "u-tech", name: "Tech One", role: Role.TECHNICIAN },
  reportDate: new Date("2026-09-03T00:00:00.000Z"),
  type: "TECHNICIAN" as const,
  jobsCompleted: 4,
  hoursWorked: 8,
  registrations: "KA-01-1234\nKA-02-5678",
  bookingsCount: 0,
  inspectionsCount: 0,
  notes: "",
  createdAt: new Date("2026-09-03T17:30:00.000Z"),
  updatedAt: new Date("2026-09-03T17:30:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(technicianSession as never);
  vi.mocked(requireRole).mockResolvedValue(technicianSession as never);
  vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/daily-reports", () => {
  it("returns a technician's own report for today in their timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc); // Sep 3 23:00 IST
    vi.mocked(prisma.dailyReport.findFirst).mockResolvedValue(fakeReportRow as never);

    const res = await getDailyReports(requestFor("Asia/Kolkata"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.report).toMatchObject({
      authorId: "u-tech",
      authorName: "Tech One",
      jobsCompleted: 4,
    });
    // The query window is the local day: Sep 3 00:00 IST = Sep 2 18:30Z.
    expect(prisma.dailyReport.findFirst).toHaveBeenCalledWith({
      where: {
        authorId: "u-tech",
        reportDate: {
          gte: new Date("2026-09-02T18:30:00.000Z"),
          lt: new Date("2026-09-03T18:30:00.000Z"),
        },
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
  });

  it("returns a technician's own past reports for history=true", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    vi.mocked(prisma.dailyReport.findMany).mockResolvedValue([
      fakeReportRow,
    ] as never);

    const res = await getDailyReports(requestFor("Asia/Kolkata", "history=true"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].authorId).toBe("u-tech");
    expect(prisma.dailyReport.findMany).toHaveBeenCalledWith({
      where: { authorId: "u-tech" },
      orderBy: { reportDate: "desc" },
      take: 30,
      include: { author: { select: { id: true, name: true, role: true } } },
    });
  });

  it("returns report:null when a technician has not filed for the day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    vi.mocked(prisma.dailyReport.findFirst).mockResolvedValue(null as never);

    const res = await getDailyReports(requestFor("Asia/Kolkata"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ report: null });
  });

  it("lets a manager list their own + technicians' reports for a chosen date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    vi.mocked(auth).mockResolvedValue(managerSession as never);
    // Reportable users: technicians.
    vi.mocked(prisma.user.findMany).mockResolvedValue([techUser] as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(managerUser as never);
    vi.mocked(prisma.dailyReport.findMany).mockResolvedValue([fakeReportRow] as never);

    const res = await getDailyReports(requestFor("Asia/Kolkata", "date=2026-09-03"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.date).toBe("2026-09-03");
    expect(body.reports).toHaveLength(1);
    // Author filter dropdown: self (manager) + technicians.
    expect(body.authors.map((a: { id: string }) => a.id).sort()).toEqual([
      "u-manager",
      "u-tech",
    ]);
  });

  it("admins can see managers and technicians with a date filter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([managerUser, techUser] as never);
    vi.mocked(prisma.dailyReport.findMany).mockResolvedValue([fakeReportRow] as never);

    const res = await getDailyReports(requestFor("UTC", "date=2026-09-03"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reports).toHaveLength(1);
    // Admin's author filter is managers + technicians (not admins).
    expect(body.authors.map((a: { id: string }) => a.id).sort()).toEqual([
      "u-manager",
      "u-tech",
    ]);
  });

  it("a technician ignores an authorId query (never sees others)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    vi.mocked(prisma.dailyReport.findFirst).mockResolvedValue(fakeReportRow as never);

    const res = await getDailyReports(
      requestFor("Asia/Kolkata", "date=2026-09-03&authorId=some-other-tech")
    );

    expect(res.status).toBe(200);
    // Still scoped to their own id only.
    expect(prisma.dailyReport.findFirst).toHaveBeenCalledWith({
      where: {
        authorId: "u-tech",
        reportDate: expect.objectContaining({ gte: expect.any(Date) }),
      },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    expect(prisma.dailyReport.findMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid date with 400", async () => {
    const res = await getDailyReports(requestFor("UTC", "date=not-a-date"));
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await getDailyReports(requestFor("UTC"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/daily-reports", () => {
  it("blocks a technician before 5 PM local with 403", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.nyBeforeOpen); // 16:59 EST
    vi.mocked(requireRole).mockResolvedValue(technicianSession as never);

    const res = await postDailyReport(
      requestFor("America/New_York", "", {
        reportType: "TECHNICIAN",
        jobsCompleted: 2,
        hoursWorked: 8,
        registrations: "KA-01-1234",
        issues: "",
      })
    );

    expect(res.status).toBe(403);
    expect(prisma.dailyReport.upsert).not.toHaveBeenCalled();
  });

  it("allows a technician to file at/after 5 PM local and upserts today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc); // 23:00 IST
    vi.mocked(prisma.user.findUnique).mockResolvedValue(techUser as never);
    vi.mocked(prisma.dailyReport.upsert).mockResolvedValue(fakeReportRow as never);

    const res = await postDailyReport(
      requestFor("Asia/Kolkata", "", {
        reportType: "TECHNICIAN",
        jobsCompleted: 4,
        hoursWorked: 8,
        registrations: " KA-01-1234 \n\nKA-02-5678 \n",
        issues: "Brake light on van 3",
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.report).toMatchObject({ authorName: "Tech One", jobsCompleted: 4 });
    expect(prisma.dailyReport.upsert).toHaveBeenCalledWith({
      where: {
        authorId_reportDate: {
          authorId: "u-tech",
          reportDate: new Date("2026-09-02T18:30:00.000Z"), // Sep 3 00:00 IST
        },
      },
      create: {
        authorId: "u-tech",
        reportDate: new Date("2026-09-02T18:30:00.000Z"),
        type: "TECHNICIAN",
        jobsCompleted: 4,
        hoursWorked: 8,
        // Trims and drops blank lines.
        registrations: "KA-01-1234\nKA-02-5678",
        notes: "Brake light on van 3",
      },
      update: expect.objectContaining({
        registrations: "KA-01-1234\nKA-02-5678",
      }),
    });
  });

  it("rejects a technician sending a manager-form payload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    const res = await postDailyReport(
      requestFor("Asia/Kolkata", "", {
        reportType: "FLEET_MANAGER",
        bookingsCount: 3,
        inspectionsCount: 2,
        notes: "",
      })
    );
    expect(res.status).toBe(403);
  });

  it("rejects invalid numbers with 400", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(REPORTED_AT.afterIstAndUtc);
    const res = await postDailyReport(
      requestFor("Asia/Kolkata", "", {
        reportType: "TECHNICIAN",
        jobsCompleted: -1,
        hoursWorked: 30,
        registrations: "",
        issues: "",
      })
    );
    expect(res.status).toBe(400);
  });
});
