import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getTimeline } from "@/app/api/service-records/[id]/timeline/route";
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
    serviceHistoryEvent: {
      findMany: vi.fn(),
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
  assignments: [
    { id: "a1", technicianId: "u-tech1", unassignedAt: null },
  ],
};

const managerUser = { name: "Alice Manager", role: "FLEET_MANAGER" };
const technicianUser = { name: "Bob Tech", role: "TECHNICIAN" };

const createdEvent = {
  id: "e1",
  serviceRecordId: "r1",
  type: "CREATED",
  fromStatus: null,
  toStatus: null,
  note: null,
  actorId: "u-manager",
  technicianId: null,
  createdAt: new Date("2026-08-01T10:00:00Z"),
  actor: managerUser,
  technician: null,
};

const assignedEvent = {
  id: "e2",
  serviceRecordId: "r1",
  type: "ASSIGNED",
  fromStatus: null,
  toStatus: null,
  note: null,
  actorId: "u-manager",
  technicianId: "u-tech1",
  createdAt: new Date("2026-08-02T10:00:00Z"),
  actor: managerUser,
  technician: { name: "Bob Tech" },
};

const statusChangeEvent = {
  id: "e3",
  serviceRecordId: "r1",
  type: "STATUS_CHANGE",
  fromStatus: "DUE",
  toStatus: "BOOKED",
  note: null,
  actorId: "u-manager",
  technicianId: null,
  createdAt: new Date("2026-08-03T10:00:00Z"),
  actor: managerUser,
  technician: null,
};

const asNextRequest = (req: Request) => req as unknown as NextRequest;
const params = { params: Promise.resolve({ id: "r1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
  vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
    baseRecord as never
  );
  vi.mocked(prisma.serviceHistoryEvent.findMany).mockResolvedValue(
    [createdEvent, assignedEvent, statusChangeEvent] as never
  );
});

describe("GET /api/service-records/[id]/timeline", () => {
  it("returns events oldest-first with actor resolved and human-readable summaries", async () => {
    const res = await getTimeline(
      asNextRequest(new Request("http://localhost/api/service-records/r1/timeline")),
      params
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveLength(3);
    expect(body[0]).toMatchObject({
      type: "CREATED",
      actor: { id: "u-manager", name: "Alice Manager", role: "FLEET_MANAGER" },
      technician: null,
      summary: "Record created",
    });
    expect(body[1]).toMatchObject({
      type: "ASSIGNED",
      actor: { name: "Alice Manager" },
      technician: { name: "Bob Tech" },
      summary: "Alice Manager assigned Bob Tech",
    });
    expect(body[2]).toMatchObject({
      type: "STATUS_CHANGE",
      summary: "Status changed from DUE to BOOKED",
    });

    // Oldest-first ordering.
    const times = body.map((e: { createdAt: string }) => new Date(e.createdAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(prisma.serviceHistoryEvent.findMany).toHaveBeenCalledWith({
      where: { serviceRecordId: "r1" },
      orderBy: { createdAt: "asc" },
      include: {
        actor: { select: { name: true, role: true } },
        technician: { select: { name: true } },
      },
    });
  });

  it("allows a technician assigned to the record to view its timeline", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);

    const res = await getTimeline(
      asNextRequest(new Request("http://localhost/api/service-records/r1/timeline")),
      params
    );

    expect(res.status).toBe(200);
  });

  it("rejects a technician not assigned to the record with 403", async () => {
    vi.mocked(auth).mockResolvedValue(otherTechnicianSession as never);

    const res = await getTimeline(
      asNextRequest(new Request("http://localhost/api/service-records/r1/timeline")),
      params
    );

    expect(res.status).toBe(403);
    expect(prisma.serviceHistoryEvent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown record", async () => {
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(null as never);

    const res = await getTimeline(
      asNextRequest(new Request("http://localhost/api/service-records/nope/timeline")),
      { params: Promise.resolve({ id: "nope" }) }
    );

    expect(res.status).toBe(404);
    expect(prisma.serviceHistoryEvent.findMany).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await getTimeline(
      asNextRequest(new Request("http://localhost/api/service-records/r1/timeline")),
      params
    );

    expect(res.status).toBe(401);
    expect(prisma.serviceRecord.findUnique).not.toHaveBeenCalled();
  });
});
