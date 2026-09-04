import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as search } from "@/app/api/search/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    auth: vi.fn(),
    requireRole: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    vehicle: { findMany: vi.fn() },
    serviceRecord: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const technicianSession = { user: { id: "u-tech1", role: "TECHNICIAN" } };

// GET reads request.nextUrl.searchParams; the Vitest stub types NextRequest as
// the base Request, so build a Request and attach the nextUrl surface (same
// pattern as the service-records list tests). Callers pass the query WITHOUT a
// leading "?".
function asNextRequest(query = ""): NextRequest {
  const qs = query.startsWith("?") ? query.slice(1) : query;
  const req = new Request(
    `http://localhost/api/search${qs ? `?${qs}` : ""}`
  );
  return Object.assign(req, {
    nextUrl: new URL(req.url),
  }) as unknown as NextRequest;
}

const vehicleRow = {
  id: "v1",
  registrationNumber: "AB12 CDE",
  make: "Ford",
  model: "Transit",
  currentOdometer: 84_320,
  archivedAt: null,
};
const recordRow = {
  id: "r1",
  description: "Brake pad replacement",
  status: "IN_SERVICE",
  vehicle: { registrationNumber: "AB12 CDE" },
};
const technicianRow = {
  id: "u-tech1",
  name: "Technician One",
  email: "tech1@fleet.test",
  role: "TECHNICIAN",
};
const managerRow = {
  id: "u-manager",
  name: "Fleet Manager",
  email: "manager@fleet.test",
  role: "FLEET_MANAGER",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/search", () => {
  it("returns grouped results for a manager, including people of both roles", async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([vehicleRow] as never);
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([recordRow] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      technicianRow,
      managerRow,
    ] as never);

    const res = await search(asNextRequest("?q=transit"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vehicles).toEqual([vehicleRow]);
    expect(body.serviceRecords).toEqual([recordRow]);
    expect(body.technicians).toEqual([technicianRow]);
    expect(body.managers).toEqual([managerRow]);
  });

  it("scopes records to the technician's own active assignments", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);

    await search(asNextRequest("?q=brake"));
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assignments: {
            some: { technicianId: "u-tech1", unassignedAt: null },
          },
          description: { contains: "brake", mode: "insensitive" },
        },
      })
    );
  });

  it("never queries vehicles or people for a technician", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);

    const res = await search(asNextRequest("?q=@fleet.test"));
    const body = await res.json();

    // Technicians only search their own scoped service records.
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(body.vehicles).toEqual([]);
    expect(body.technicians).toEqual([]);
    expect(body.managers).toEqual([]);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await search(asNextRequest("?q=transit"));
    expect(res.status).toBe(401);
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
  });

  it("returns empty groups for a blank query without querying", async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never);
    const res = await search(asNextRequest("?q=%20%20"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      vehicles: [],
      serviceRecords: [],
      technicians: [],
      managers: [],
    });
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled();
  });
});
