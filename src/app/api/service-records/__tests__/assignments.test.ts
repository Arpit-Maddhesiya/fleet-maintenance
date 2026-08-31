import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as createAssignment } from "@/app/api/service-records/[id]/assignments/route";
import { DELETE as removeAssignment } from "@/app/api/service-records/[id]/assignments/[assignmentId]/route";
import { GET as technicianServiceRecords } from "@/app/api/technicians/[id]/service-records/route";
import { PATCH as updateRecordDescription } from "@/app/api/service-records/[id]/route";
import { requireRole, auth, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

// Route handlers are typed against the real NextRequest, but under Vitest the
// handlers run against a plain Request — the handlers only read the body.
const asNextRequest = (req: Request) => req as unknown as NextRequest;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireRole: vi.fn(),
    auth: vi.fn(),
  };
});

vi.mock("@/lib/db", () => {
  const serviceAssignment = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const serviceHistoryEvent = {
    create: vi.fn(),
  };
  return {
    prisma: {
      serviceRecord: {
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
      },
      serviceAssignment,
      serviceHistoryEvent,
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        // Inside a real transaction the route gets a tx client with the same
        // model methods; mirror that so tx.serviceAssignment.create etc. work.
        fn({ serviceAssignment, serviceHistoryEvent })
      ),
    },
  };
});

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const technicianSession = { user: { id: "u-tech1", role: "TECHNICIAN" } };
const otherTechnicianSession = { user: { id: "u-tech2", role: "TECHNICIAN" } };

const technicianUser = {
  id: "u-tech1",
  role: "TECHNICIAN",
};

const baseAssignment = {
  id: "a1",
  serviceRecordId: "r1",
  technicianId: "u-tech1",
  assignedAt: new Date(),
  unassignedAt: null,
};

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
  assignments: [baseAssignment],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(managerSession as never);
  vi.mocked(auth).mockResolvedValue(managerSession as never);
});

describe("POST /api/service-records/[id]/assignments", () => {
  const params = { params: Promise.resolve({ id: "r1" }) };

  it("creates an assignment and records an ASSIGNED history event", async () => {
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue({
      id: "r1",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(technicianUser as never);
    vi.mocked(prisma.serviceAssignment.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.serviceAssignment.create).mockResolvedValue(
      baseAssignment as never
    );

    const res = await createAssignment(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1/assignments", {
          method: "POST",
          body: JSON.stringify({ technicianId: "u-tech1" }),
        })
      ),
      params
    );

    expect(res.status).toBe(201);
    expect(prisma.serviceAssignment.create).toHaveBeenCalledWith({
      data: {
        serviceRecordId: "r1",
        technicianId: "u-tech1",
      },
    });
    expect(prisma.serviceHistoryEvent.create).toHaveBeenCalledWith({
      data: {
        serviceRecordId: "r1",
        type: "ASSIGNED",
        actorId: "u-manager",
      },
    });
  });

  it("rejects a technician (non-manager) with 403 before touching the DB", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires the FLEET_MANAGER role.",
        "FLEET_MANAGER"
      )
    );

    const res = await createAssignment(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1/assignments", {
          method: "POST",
          body: JSON.stringify({ technicianId: "u-tech1" }),
        })
      ),
      params
    );

    expect(res.status).toBe(403);
    expect(prisma.serviceAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects double-assignment of an actively assigned technician with 409", async () => {
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue({
      id: "r1",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(technicianUser as never);
    vi.mocked(prisma.serviceAssignment.findFirst).mockResolvedValue(
      baseAssignment as never
    );

    const res = await createAssignment(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1/assignments", {
          method: "POST",
          body: JSON.stringify({ technicianId: "u-tech1" }),
        })
      ),
      params
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe(
      "This technician is already assigned to this service record."
    );
    expect(prisma.serviceAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects a non-technician user as assignee with 400", async () => {
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue({
      id: "r1",
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-manager",
      role: "FLEET_MANAGER",
    } as never);

    const res = await createAssignment(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1/assignments", {
          method: "POST",
          body: JSON.stringify({ technicianId: "u-manager" }),
        })
      ),
      params
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe(
      "Assignments can only be created for technicians."
    );
    expect(prisma.serviceAssignment.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/service-records/[id]/assignments/[assignmentId]", () => {
  const params = {
    params: Promise.resolve({ id: "r1", assignmentId: "a1" }),
  };

  it("soft-unassigns (sets unassignedAt) and records an UNASSIGNED history event", async () => {
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue({
      id: "r1",
    } as never);
    vi.mocked(prisma.serviceAssignment.findFirst).mockResolvedValue(
      baseAssignment as never
    );
    vi.mocked(prisma.serviceAssignment.update).mockResolvedValue({
      ...baseAssignment,
      unassignedAt: new Date(),
    } as never);

    const res = await removeAssignment(
      asNextRequest(
        new Request(
          "http://localhost/api/service-records/r1/assignments/a1",
          { method: "DELETE" }
        )
      ),
      params
    );

    expect(res.status).toBe(200);
    expect(prisma.serviceAssignment.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { unassignedAt: expect.any(Date) },
    });
    expect(prisma.serviceHistoryEvent.create).toHaveBeenCalledWith({
      data: {
        serviceRecordId: "r1",
        type: "UNASSIGNED",
        actorId: "u-manager",
      },
    });
    // Never hard-deletes — the row must stay for history.
    expect(prisma.serviceAssignment.delete).toBeUndefined();
  });

  it("rejects a technician (non-manager) with 403", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires the FLEET_MANAGER role.",
        "FLEET_MANAGER"
      )
    );

    const res = await removeAssignment(
      asNextRequest(
        new Request(
          "http://localhost/api/service-records/r1/assignments/a1",
          { method: "DELETE" }
        )
      ),
      params
    );

    expect(res.status).toBe(403);
    expect(prisma.serviceAssignment.update).not.toHaveBeenCalled();
  });
});

describe("GET /api/technicians/[id]/service-records", () => {
  it("returns a technician's actively assigned records with vehicle info", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(technicianUser as never);
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      { ...baseRecord, vehicle: { id: "v1" } },
    ] as never);

    const res = await technicianServiceRecords(
      asNextRequest(
        new Request("http://localhost/api/technicians/u-tech1/service-records")
      ),
      { params: Promise.resolve({ id: "u-tech1" }) }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalledWith({
      where: {
        assignments: {
          some: {
            technicianId: "u-tech1",
            unassignedAt: null,
          },
        },
      },
      include: { vehicle: true },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("rejects a technician requesting another technician's list with 403", async () => {
    vi.mocked(auth).mockResolvedValue(otherTechnicianSession as never);

    const res = await technicianServiceRecords(
      asNextRequest(
        new Request("http://localhost/api/technicians/u-tech1/service-records")
      ),
      { params: Promise.resolve({ id: "u-tech1" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("You can only view your own service records.");
    expect(prisma.serviceRecord.findMany).not.toHaveBeenCalled();
  });

  it("allows a fleet manager to view any technician's list", async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(technicianUser as never);
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([] as never);

    const res = await technicianServiceRecords(
      asNextRequest(
        new Request("http://localhost/api/technicians/u-tech1/service-records")
      ),
      { params: Promise.resolve({ id: "u-tech1" }) }
    );

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.findMany).toHaveBeenCalled();
  });

  it("returns 404 for an unknown technician", async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const res = await technicianServiceRecords(
      asNextRequest(
        new Request("http://localhost/api/technicians/nope/service-records")
      ),
      { params: Promise.resolve({ id: "nope" }) }
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/service-records/[id] (description)", () => {
  const params = { params: Promise.resolve({ id: "r1" }) };

  it("allows an assigned technician to update the description", async () => {
    vi.mocked(auth).mockResolvedValue(technicianSession as never);
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      baseRecord as never
    );
    vi.mocked(prisma.serviceRecord.update).mockResolvedValue({
      ...baseRecord,
      description: "Brake pads (updated)",
    } as never);

    const res = await updateRecordDescription(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1", {
          method: "PATCH",
          body: JSON.stringify({ description: "Brake pads (updated)" }),
        })
      ),
      params
    );

    expect(res.status).toBe(200);
    expect(prisma.serviceRecord.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { description: "Brake pads (updated)" },
    });
  });

  it("rejects an unassigned technician with 403", async () => {
    vi.mocked(auth).mockResolvedValue(otherTechnicianSession as never);
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      {
        ...baseRecord,
        assignments: [{ ...baseAssignment, technicianId: "u-tech1" }],
      } as never
    );

    const res = await updateRecordDescription(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1", {
          method: "PATCH",
          body: JSON.stringify({ description: "Brake pads (updated)" }),
        })
      ),
      params
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("You are not assigned to this service record.");
    expect(prisma.serviceRecord.update).not.toHaveBeenCalled();
  });

  it("allows a fleet manager to update the description", async () => {
    vi.mocked(auth).mockResolvedValue(managerSession as never);
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      baseRecord as never
    );
    vi.mocked(prisma.serviceRecord.update).mockResolvedValue({
      ...baseRecord,
      description: "Brake pads (updated)",
    } as never);

    const res = await updateRecordDescription(
      asNextRequest(
        new Request("http://localhost/api/service-records/r1", {
          method: "PATCH",
          body: JSON.stringify({ description: "Brake pads (updated)" }),
        })
      ),
      params
    );

    expect(res.status).toBe(200);
  });
});
