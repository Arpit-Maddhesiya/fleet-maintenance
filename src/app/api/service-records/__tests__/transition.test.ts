import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as transitionPost } from "@/app/api/service-records/[id]/transition/route";
import { requireRole, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

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
  const serviceRecord = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const serviceAssignment = {
    create: vi.fn(),
  };
  const serviceHistoryEvent = {
    create: vi.fn(),
  };
  const vehicle = {
    update: vi.fn(),
  };
  return {
    prisma: {
      serviceRecord,
      serviceAssignment,
      serviceHistoryEvent,
      vehicle,
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ serviceRecord, serviceAssignment, serviceHistoryEvent, vehicle })
      ),
    },
  };
});

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const assignedTechSession = { user: { id: "u-tech1", role: "TECHNICIAN" } };
const otherTechSession = { user: { id: "u-tech2", role: "TECHNICIAN" } };

const params = { params: Promise.resolve({ id: "r1" }) };

function makeRecord(status: string, assignedTechId = "u-tech1") {
  return {
    id: "r1",
    vehicleId: "v1",
    description: "Brake pads",
    status,
    scheduledDate: new Date(),
    startedAt: null,
    completedAt: null,
    completedOdometer: null,
    dueSince: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    vehicle: { id: "v1", currentOdometer: 50_000 },
    assignments: [
      {
        id: "a1",
        serviceRecordId: "r1",
        technicianId: assignedTechId,
        assignedAt: new Date(),
        unassignedAt: null,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.serviceRecord.update).mockImplementation(
    (async ({ data }: { data: Record<string, unknown> }) => data) as never
  );
});

describe("POST /api/service-records/[id]/transition — technician authorization", () => {
  it("lets an assigned technician START a BOOKED record", async () => {
    vi.mocked(requireRole).mockResolvedValue(assignedTechSession as never);
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      makeRecord("BOOKED") as never
    );

    const res = await transitionPost(
      asNextRequest(
        new Request("http://test/api/service-records/r1/transition", {
          method: "POST",
          body: JSON.stringify({ action: "START" }),
        })
      ),
      params
    );

    expect(res.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith("FLEET_MANAGER", "TECHNICIAN");
  });

  it("lets an assigned technician COMPLETE an IN_SERVICE record", async () => {
    vi.mocked(requireRole).mockResolvedValue(assignedTechSession as never);
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      makeRecord("IN_SERVICE") as never
    );

    const res = await transitionPost(
      asNextRequest(
        new Request("http://test/api/service-records/r1/transition", {
          method: "POST",
          body: JSON.stringify({ action: "COMPLETE", completedOdometer: 51_000 }),
        })
      ),
      params
    );

    expect(res.status).toBe(200);
  });

  it("rejects a technician not assigned to the record with 403", async () => {
    vi.mocked(requireRole).mockResolvedValue(otherTechSession as never);
    // Other tech's record has a different assignee.
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      makeRecord("BOOKED", "u-tech1") as never
    );

    const res = await transitionPost(
      asNextRequest(
        new Request("http://test/api/service-records/r1/transition", {
          method: "POST",
          body: JSON.stringify({ action: "START" }),
        })
      ),
      params
    );

    expect(res.status).toBe(403);
  });

  it("rejects a technician BOOKing a record with 403", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError("This action requires one of the following roles: FLEET_MANAGER, ADMIN.")
    );
    vi.mocked(prisma.serviceRecord.findUnique).mockResolvedValue(
      makeRecord("DUE") as never
    );

    const res = await transitionPost(
      asNextRequest(
        new Request("http://test/api/service-records/r1/transition", {
          method: "POST",
          body: JSON.stringify({
            action: "BOOK",
            scheduledDate: new Date().toISOString(),
            technicianId: "u-tech1",
          }),
        })
      ),
      params
    );

    expect(res.status).toBe(403);
    expect(requireRole).toHaveBeenCalledWith("FLEET_MANAGER");
  });
});
