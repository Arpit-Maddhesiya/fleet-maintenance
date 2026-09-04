import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getRecord } from "@/app/api/service-records/[id]/route";
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
      findUnique: vi.fn(),
    },
  },
}));

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const technicianSession = { user: { id: "u-tech1", role: "TECHNICIAN" } };
const otherTechnicianSession = { user: { id: "u-tech2", role: "TECHNICIAN" } };

const baseRecord = {
  id: "r1",
  vehicleId: "v1",
  description: "Brake pads",
  status: "BOOKED",
  scheduledDate: new Date(),
  startedAt: null,
  completedAt: null,
  completedOdometer: null,
  dueSince: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  vehicle: { id: "v1", registrationNumber: "AB12 CDE" },
  assignments: [
    {
      id: "a1",
      technicianId: "u-tech1",
      unassignedAt: null,
      technician: { id: "u-tech1", name: "Bob Tech" },
    },
  ],
};

const asNextRequest = (req: Request) => req as unknown as NextRequest;
const params = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
  vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
    baseRecord as never
  );
});

describe("GET /api/service-records/[id]", () => {
  it("returns the record with vehicle and active assignments for a manager", async () => {
    const res = await getRecord(
      asNextRequest(new Request("http://localhost/api/service-records/r1")),
      params
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "r1",
      vehicle: { registrationNumber: "AB12 CDE" },
      assignments: [{ technician: { name: "Bob Tech" } }],
    });
    // All assignments are loaded (so a technician's history can be authorized)
    // but only active ones are returned to the client.
    expect(prisma.serviceRecord.findUnique).toHaveBeenCalledWith({
      where: { id: "r1" },
      include: {
        vehicle: true,
        assignments: {
          include: { technician: { select: { id: true, name: true } } },
        },
      },
    });
  });

  it("allows a technician actively assigned to the record", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);

    const res = await getRecord(
      asNextRequest(new Request("http://localhost/api/service-records/r1")),
      params
    );

    expect(res.status).toBe(200);
  });

  it("allows a technician to view a record they previously worked on (closed assignment)", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue({
      ...baseRecord,
      status: "COMPLETED",
      // The assignment is now closed (the tech completed this job).
      assignments: [
        { ...baseRecord.assignments[0], unassignedAt: new Date() },
      ],
    } as never);

    const res = await getRecord(
      asNextRequest(new Request("http://localhost/api/service-records/r1")),
      params
    );

    expect(res.status).toBe(200);
    // Closed assignments are filtered out of the response shape.
    const body = await res.json();
    expect(body.assignments).toEqual([]);
  });

  it("rejects a technician not assigned to the record with 403", async () => {
    vi.mocked(auth).mockResolvedValue(otherTechnicianSession as never);

    const res = await getRecord(
      asNextRequest(new Request("http://localhost/api/service-records/r1")),
      params
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("You are not assigned to this service record.");
  });

  it("returns 404 for an unknown record", async () => {
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(null as never);

    const res = await getRecord(
      asNextRequest(new Request("http://localhost/api/service-records/nope")),
      { params: Promise.resolve({ id: "nope" }) }
    );

    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await getRecord(
      asNextRequest(new Request("http://localhost/api/service-records/r1")),
      params
    );

    expect(res.status).toBe(401);
    expect(prisma.serviceRecord.findUnique).not.toHaveBeenCalled();
  });
});
