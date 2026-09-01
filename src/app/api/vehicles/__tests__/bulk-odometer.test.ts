import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST as bulkImportOdometer } from "@/app/api/vehicles/bulk-odometer/route";
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
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const managerSession = { user: { role: "FLEET_MANAGER" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(managerSession as never);
});

function csvUpload(csv: string): Request {
  return new Request("http://localhost/api/vehicles/bulk-odometer", {
    method: "POST",
    body: (() => {
      const form = new FormData();
      form.append("file", new File([csv], "odometer.csv", { type: "text/csv" }));
      return form;
    })(),
  });
}

describe("POST /api/vehicles/bulk-odometer", () => {
  it("applies valid rows and rejects only the bad row (not all-or-nothing)", async () => {
    // Row 2 proposes a reading lower than the vehicle's current one, so it
    // must be rejected while rows 1 and 3 are applied to the DB.
    const csv = [
      "registrationNumber,odometerReading",
      "ABC-123,125000",
      "ABC-123,119000", // lower than current 120000 -> rejected
      "ABC-123,130000",
    ].join("\n");

    vi.mocked(prisma.vehicle.findUnique)
      .mockResolvedValueOnce({
        id: "v1",
        registrationNumber: "ABC-123",
        currentOdometer: 120000,
      } as never) // row 1
      .mockResolvedValueOnce({
        id: "v1",
        registrationNumber: "ABC-123",
        currentOdometer: 120000,
      } as never) // row 2 (rejected)
      .mockResolvedValueOnce({
        id: "v1",
        registrationNumber: "ABC-123",
        currentOdometer: 120000,
      } as never); // row 3

    const res = await bulkImportOdometer(asNextRequest(csvUpload(csv)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.successCount).toBe(2);
    expect(body.rejectedCount).toBe(1);
    expect(body.results).toEqual([
      {
        row: 2,
        registrationNumber: "ABC-123",
        status: "success",
      },
      {
        row: 3,
        registrationNumber: "ABC-123",
        status: "rejected",
        reason:
          "New reading 119000 is lower than current recorded reading 120000.",
      },
      {
        row: 4,
        registrationNumber: "ABC-123",
        status: "success",
      },
    ]);

    // Both valid rows hit the DB — the rejected row did not roll anything back.
    expect(prisma.vehicle.update).toHaveBeenCalledTimes(2);
    expect(prisma.vehicle.update).toHaveBeenNthCalledWith(1, {
      where: { id: "v1" },
      data: { currentOdometer: 125000 },
    });
    expect(prisma.vehicle.update).toHaveBeenNthCalledWith(2, {
      where: { id: "v1" },
      data: { currentOdometer: 130000 },
    });
  });

  it("rejects an unknown registration number per row", async () => {
    const csv = [
      "registrationNumber,odometerReading",
      "NOPE-1,50000",
    ].join("\n");

    vi.mocked(prisma.vehicle.findUnique).mockResolvedValue(null as never);

    const res = await bulkImportOdometer(asNextRequest(csvUpload(csv)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.successCount).toBe(0);
    expect(body.rejectedCount).toBe(1);
    expect(body.results[0].reason).toBe("Vehicle NOPE-1 not found.");
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it("rejects a non-manager with 403 before touching the DB", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires the FLEET_MANAGER role.",
        "FLEET_MANAGER"
      )
    );

    const res = await bulkImportOdometer(
      asNextRequest(csvUpload("registrationNumber,odometerReading\nABC-123,125000"))
    );

    expect(res.status).toBe(403);
    expect(prisma.vehicle.findUnique).not.toHaveBeenCalled();
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the file field is missing", async () => {
    const req = new Request("http://localhost/api/vehicles/bulk-odometer", {
      method: "POST",
      body: new FormData(),
    });

    const res = await bulkImportOdometer(asNextRequest(req));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("A CSV file is required (form field 'file').");
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });
});
