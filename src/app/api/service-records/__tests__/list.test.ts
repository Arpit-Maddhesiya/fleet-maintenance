import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as listServiceRecords } from "@/app/api/service-records/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
    serviceRecord: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const include = {
  vehicle: { select: { registrationNumber: true } },
  assignments: {
    where: { unassignedAt: null },
    include: { technician: { select: { name: true } } },
  },
};

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const technicianSession = { user: { id: "u-tech1", role: "TECHNICIAN" } };

const baseRecord = {
  id: "r1",
  vehicleId: "v1",
  description: "Brake pads",
  status: "BOOKED",
  scheduledDate: new Date().toISOString(),
  startedAt: null,
  completedAt: null,
  completedOdometer: null,
  dueSince: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
  vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.serviceRecord.count).mockResolvedValue(0 as never);
});

// GET reads request.nextUrl.searchParams; the Vitest stub types NextRequest as
// the base Request, so build a Request and attach the nextUrl surface.
function listRequest(query = ""): NextRequest {
  const req = new Request(
    `http://localhost/api/service-records${query ? `?${query}` : ""}`
  );
  return Object.assign(req, {
    nextUrl: new URL(req.url),
  }) as unknown as NextRequest;
}

describe("GET /api/service-records", () => {
  it("returns records with defaults (sortBy updatedAt desc, page 1, pageSize 20)", async () => {
    const res = await listServiceRecords(listRequest());

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 20,
      include,
    });
    expect(prisma.serviceRecord.count).toHaveBeenCalledWith({ where: {} });
  });

  it("applies pagination math correctly for page 2 pageSize 10", async () => {
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      baseRecord,
      baseRecord,
      baseRecord,
    ] as never);
    vi.mocked(prisma.serviceRecord.count).mockResolvedValue(23 as never);

    const res = await listServiceRecords(
      listRequest("page=2&pageSize=10")
    );

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { updatedAt: "desc" },
      skip: 10,
      take: 10,
      include,
    });

    const body = await res.json();
    expect(body).toEqual({
      data: [baseRecord, baseRecord, baseRecord],
      total: 23,
      page: 2,
      pageSize: 10,
    });
  });

  it("rejects a pageSize above the max of 100 with 400", async () => {
    const res = await listServiceRecords(listRequest("pageSize=500"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(prisma.serviceRecord.findMany).not.toHaveBeenCalled();
  });

  it("searches description case-insensitively with contains", async () => {
    const res = await listServiceRecords(listRequest("q=brake"));

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {
        description: { contains: "brake", mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 20,
      include,
    });
  });

  it("filters by vehicleId, status, and technicianId for a manager", async () => {
    const res = await listServiceRecords(
      listRequest("vehicleId=v1&status=BOOKED&technicianId=u-tech1")
    );

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {
        vehicleId: "v1",
        status: "BOOKED",
        assignments: {
          some: {
            technicianId: "u-tech1",
            unassignedAt: null,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 20,
      include,
    });
  });

  it("scopes a technician to their own active assignments even when they pass a different technicianId", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);

    const res = await listServiceRecords(
      listRequest("technicianId=u-tech2")
    );

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {
        assignments: {
          some: {
            // The caller's id wins over the filter they passed.
            technicianId: "u-tech1",
            unassignedAt: null,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 20,
      include,
    });
  });

  it("scopes a technician even when no technicianId filter is passed", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);

    const res = await listServiceRecords(listRequest());

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {
        assignments: {
          some: {
            technicianId: "u-tech1",
            unassignedAt: null,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      skip: 0,
      take: 20,
      include,
    });
  });

  it("rejects an invalid status with 400", async () => {
    const res = await listServiceRecords(listRequest("status=WIP"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(prisma.serviceRecord.findMany).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await listServiceRecords(listRequest());

    expect(res.status).toBe(401);
    expect(prisma.serviceRecord.findMany).not.toHaveBeenCalled();
  });
});
