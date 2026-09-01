import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as getAlerts } from "@/app/api/alerts/route";
import { POST as dismissAlert } from "@/app/api/alerts/[id]/dismiss/route";
import { auth, requireRole, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ServiceStatus } from "@/generated/prisma/enums";
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

vi.mock("@/lib/db", () => ({
  prisma: {
    serviceRecord: { findMany: vi.fn() },
    alert: {
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };
const technicianSession = { user: { id: "u-tech1", role: "TECHNICIAN" } };

const overdueSince = new Date(Date.now() - 8 * 86400000); // 8 days ago > 7-day grace
const withinGraceSince = new Date(Date.now() - 2 * 86400000); // 2 days ago

const baseAlert = {
  id: "a1",
  vehicleId: "v1",
  serviceCycle: 1,
  triggeredAt: new Date(),
  dismissedAt: null,
  dismissedById: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
  vi.mocked(requireRole).mockResolvedValue(managerSession as never);
});

describe("GET /api/alerts", () => {
  it("creates an alert for an overdue DUE record and returns it with vehicle info and count", async () => {
    const vehicle = {
      id: "v1",
      registrationNumber: "ABC-123",
      make: "Ford",
      model: "Transit",
      serviceCycle: 3,
    };
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      {
        id: "r1",
        vehicleId: "v1",
        status: ServiceStatus.DUE,
        dueSince: overdueSince,
        vehicle: { id: "v1", serviceCycle: 3 },
      },
    ] as never);
    vi.mocked(prisma.alert.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { ...baseAlert, id: "a1", serviceCycle: 3, vehicle },
    ] as never);

    const res = await getAlerts();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({
      id: "a1",
      serviceCycle: 3,
      dismissedAt: null,
    });
    expect(body.alerts[0].vehicle.registrationNumber).toBe("ABC-123");

    expect(prisma.alert.createMany).toHaveBeenCalledWith({
      data: [{ vehicleId: "v1", serviceCycle: 3 }],
      skipDuplicates: true,
    });
  });

  it("does not create an alert while the DUE record is still within the grace period", async () => {
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      {
        id: "r1",
        vehicleId: "v1",
        status: ServiceStatus.DUE,
        dueSince: withinGraceSince,
        vehicle: { id: "v1", serviceCycle: 1 },
      },
    ] as never);
    vi.mocked(prisma.alert.findMany).mockResolvedValue([] as never);

    const res = await getAlerts();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.alerts).toEqual([]);
    expect(prisma.alert.createMany).not.toHaveBeenCalled();
  });

  it("only returns alerts for the vehicle's current service cycle", async () => {
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([] as never);
    const vehicle = {
      id: "v1",
      registrationNumber: "ABC-123",
      make: "Ford",
      model: "Transit",
      serviceCycle: 2,
    };
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { ...baseAlert, serviceCycle: 1, vehicle }, // stale cycle-1 alert
    ] as never);

    const res = await getAlerts();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.alerts).toEqual([]);
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await getAlerts();

    expect(res.status).toBe(401);
    expect(prisma.serviceRecord.findMany).not.toHaveBeenCalled();
    expect(prisma.alert.createMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/alerts/[id]/dismiss", () => {
  const dismissParams = { params: Promise.resolve({ id: "a1" }) };

  it("dismisses an alert as a fleet manager, recording who did it", async () => {
    vi.mocked(prisma.alert.findUnique).mockResolvedValue(baseAlert as never);
    vi.mocked(prisma.alert.update).mockResolvedValue({
      ...baseAlert,
      dismissedAt: new Date(),
      dismissedById: "u-manager",
    } as never);

    const res = await dismissAlert(
      asNextRequest(
        new Request("http://localhost/api/alerts/a1/dismiss", { method: "POST" })
      ),
      dismissParams
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dismissedAt).toBeTruthy();
    expect(body.dismissedById).toBe("u-manager");
    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { dismissedAt: expect.any(Date), dismissedById: "u-manager" },
    });
  });

  it("rejects a technician (non-manager) with 403 before touching the DB", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires the FLEET_MANAGER role.",
        "FLEET_MANAGER"
      )
    );

    const res = await dismissAlert(
      asNextRequest(
        new Request("http://localhost/api/alerts/a1/dismiss", { method: "POST" })
      ),
      dismissParams
    );

    expect(res.status).toBe(403);
    expect(prisma.alert.findUnique).not.toHaveBeenCalled();
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown alert", async () => {
    vi.mocked(prisma.alert.findUnique).mockResolvedValue(null as never);

    const res = await dismissAlert(
      asNextRequest(
        new Request("http://localhost/api/alerts/nope/dismiss", { method: "POST" })
      ),
      { params: Promise.resolve({ id: "nope" }) }
    );

    expect(res.status).toBe(404);
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });

  it("is idempotent: dismissing an already-dismissed alert does not update it again", async () => {
    vi.mocked(prisma.alert.findUnique).mockResolvedValue({
      ...baseAlert,
      dismissedAt: new Date(),
      dismissedById: "u-manager",
    } as never);

    const res = await dismissAlert(
      asNextRequest(
        new Request("http://localhost/api/alerts/a1/dismiss", { method: "POST" })
      ),
      dismissParams
    );

    expect(res.status).toBe(200);
    expect(prisma.alert.update).not.toHaveBeenCalled();
  });
});

describe("reappearance rule: dismissed alert returns on the NEXT cycle", () => {
  it("creates a new non-dismissed alert when the vehicle goes overdue again after a completed service", async () => {
    // In-memory Alert table enforcing the unique [vehicleId, serviceCycle]
    // constraint, exactly like the database.
    const vehicle = { id: "v1", serviceCycle: 1 };
    const alerts: Array<Record<string, unknown>> = [];
    let seq = 0;

    vi.mocked(prisma.alert.createMany).mockImplementation(
      (async ({ data, skipDuplicates }: { data: { vehicleId: string; serviceCycle: number }[]; skipDuplicates?: boolean }) => {
        let count = 0;
        for (const row of data) {
          const exists = alerts.some(
            (a) => a.vehicleId === row.vehicleId && a.serviceCycle === row.serviceCycle
          );
          if (exists) {
            if (skipDuplicates) continue;
            throw new Error("unique constraint violated");
          }
          alerts.push({
            id: `alert-${++seq}`,
            vehicleId: row.vehicleId,
            serviceCycle: row.serviceCycle,
            triggeredAt: new Date(),
            dismissedAt: null,
            dismissedById: null,
            vehicle,
          });
          count++;
        }
        return { count };
      }) as never
    );
    vi.mocked(prisma.alert.findMany).mockImplementation(
      (async ({ where }: { where?: { dismissedAt?: Date | null } }) =>
        alerts.filter((a) =>
          where?.dismissedAt === null ? a.dismissedAt === null : true
        )) as never
    );
    vi.mocked(prisma.alert.findUnique).mockImplementation(
      (async ({ where }: { where: { id: string } }) =>
        alerts.find((a) => a.id === where.id) ?? null) as never
    );
    vi.mocked(prisma.alert.update).mockImplementation(
      (async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const alert = alerts.find((a) => a.id === where.id)!;
        Object.assign(alert, data);
        return alert;
      }) as never
    );

    // --- Cycle 1: vehicle is DUE and past the grace period. ---
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      {
        id: "r1",
        vehicleId: "v1",
        status: ServiceStatus.DUE,
        dueSince: overdueSince,
        vehicle: { id: "v1", serviceCycle: 1 },
      },
    ] as never);

    const first = await getAlerts();
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.count).toBe(1);
    expect(firstBody.alerts[0]).toMatchObject({
      id: "alert-1",
      serviceCycle: 1,
      dismissedAt: null,
    });

    // --- Dismiss cycle 1's alert. ---
    const dismissed = await dismissAlert(
      asNextRequest(
        new Request("http://localhost/api/alerts/alert-1/dismiss", {
          method: "POST",
        })
      ),
      { params: Promise.resolve({ id: "alert-1" }) }
    );
    expect(dismissed.status).toBe(200);
    expect(alerts[0]).toMatchObject({
      dismissedAt: expect.any(Date),
      dismissedById: "u-manager",
    });

    // A read while still on cycle 1 must NOT resurrect the dismissed alert
    // (the unique [vehicleId, serviceCycle] slot is still occupied).
    const still = await getAlerts();
    const stillBody = await still.json();
    expect(stillBody.count).toBe(0);
    expect(alerts.filter((a) => a.serviceCycle === 1)).toHaveLength(1);

    // --- Complete the service: the cycle increments (Module 3's COMPLETE
    // transaction bumps vehicle.serviceCycle). ---
    vehicle.serviceCycle = 2;

    // --- Cycle 2: new DUE record, overdue again. ---
    vi.mocked(prisma.serviceRecord.findMany).mockResolvedValue([
      {
        id: "r2",
        vehicleId: "v1",
        status: ServiceStatus.DUE,
        dueSince: overdueSince,
        vehicle: { id: "v1", serviceCycle: 2 },
      },
    ] as never);

    const second = await getAlerts();
    expect(second.status).toBe(200);
    const secondBody = await second.json();

    // A NEW non-dismissed alert exists for cycle 2 — a different row from the
    // dismissed cycle-1 alert, which dismissing did nothing to suppress.
    expect(secondBody.count).toBe(1);
    expect(secondBody.alerts).toHaveLength(1);
    expect(secondBody.alerts[0]).toMatchObject({
      id: "alert-2",
      serviceCycle: 2,
      dismissedAt: null,
      vehicle: { id: "v1" },
    });
    expect(secondBody.alerts[0].id).not.toBe("alert-1");

    // The dismissed cycle-1 row is untouched and there is exactly one row per
    // cycle.
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({ id: "alert-1", serviceCycle: 1 });
    expect(alerts[1]).toMatchObject({ id: "alert-2", serviceCycle: 2 });
  });
});
