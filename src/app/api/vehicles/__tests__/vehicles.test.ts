import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as createVehicle } from "@/app/api/vehicles/route";
import { POST as archiveVehicle } from "@/app/api/vehicles/[id]/archive/route";
import { POST as restoreVehicle } from "@/app/api/vehicles/[id]/restore/route";
import { requireRole, ForbiddenError } from "@/lib/auth";
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

vi.mock("@/lib/db", () => ({
  prisma: {
    vehicle: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

const baseVehicle = {
  id: "v1",
  registrationNumber: "ABC-123",
  make: "Ford",
  model: "Transit",
  currentOdometer: 120000,
  dateIntervalDays: 180,
  mileageInterval: 15000,
  lastServiceDate: new Date(),
  lastServiceOdometer: 120000,
  serviceCycle: 1,
  archivedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("vehicles API", () => {
  it("archives then restores a vehicle (round trip)", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      user: { role: "FLEET_MANAGER" },
    } as never);
    vi.mocked(prisma.vehicle.update)
      .mockResolvedValueOnce({
        ...baseVehicle,
        archivedAt: new Date(),
      } as never)
      .mockResolvedValueOnce({ ...baseVehicle, archivedAt: null } as never);

    const params = { params: Promise.resolve({ id: "v1" }) };

    const archived = await archiveVehicle(
      new Request("http://localhost/api/vehicles/v1/archive", { method: "POST" }),
      params
    );
    expect(archived.status).toBe(200);
    const archivedBody = await archived.json();
    expect(archivedBody.archivedAt).toBeTruthy();

    const restored = await restoreVehicle(
      new Request("http://localhost/api/vehicles/v1/restore", { method: "POST" }),
      params
    );
    expect(restored.status).toBe(200);
    const restoredBody = await restored.json();
    expect(restoredBody.archivedAt).toBeNull();

    expect(requireRole).toHaveBeenCalledTimes(2);
    expect(requireRole).toHaveBeenCalledWith("FLEET_MANAGER");
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it("rejects a technician (non-manager) on POST /api/vehicles with 403", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError("This action requires the FLEET_MANAGER role.", "FLEET_MANAGER")
    );

    const res = await createVehicle(
      asNextRequest(
        new Request("http://localhost/api/vehicles", {
          method: "POST",
          body: JSON.stringify({
            registrationNumber: "XYZ-999",
            make: "Toyota",
            model: "Hilux",
            currentOdometer: 50000,
            dateIntervalDays: 90,
            mileageInterval: 10000,
          }),
        })
      )
    );

    expect(res.status).toBe(403);
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it("rejects a negative mileageInterval with a 400 validation error", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      user: { role: "FLEET_MANAGER" },
    } as never);

    const res = await createVehicle(
      asNextRequest(
        new Request("http://localhost/api/vehicles", {
          method: "POST",
          body: JSON.stringify({
            registrationNumber: "XYZ-999",
            make: "Toyota",
            model: "Hilux",
            currentOdometer: 50000,
            dateIntervalDays: 90,
            mileageInterval: -1000,
          }),
        })
      )
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details.fieldErrors.mileageInterval).toBeDefined();
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });
});
