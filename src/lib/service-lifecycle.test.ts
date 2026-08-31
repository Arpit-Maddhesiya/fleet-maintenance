import { describe, it, expect } from "vitest";
import { transition } from "@/lib/service-lifecycle";
import { ServiceStatus } from "@/generated/prisma/enums";
import type { ServiceRecord, Vehicle } from "@/generated/prisma/client";

// Minimal records/vehicles: transition() only reads status (record) and
// currentOdometer (vehicle), so these fixtures are enough.
const dueRecord = { status: ServiceStatus.DUE } as ServiceRecord;
const bookedRecord = { status: ServiceStatus.BOOKED } as ServiceRecord;
const inServiceRecord = { status: ServiceStatus.IN_SERVICE } as ServiceRecord;
const completedRecord = { status: ServiceStatus.COMPLETED } as ServiceRecord;
const vehicle = { currentOdometer: 100000 } as Vehicle;

describe("transition: legal transitions", () => {
  it("books a DUE record (DUE -> BOOKED) with a scheduled date and technician", () => {
    const result = transition(dueRecord, "BOOK", {
      scheduledDate: "2026-09-15T09:00:00Z",
      technicianId: "tech-1",
    });

    expect(result).toEqual({
      ok: true,
      patch: {
        status: ServiceStatus.BOOKED,
        scheduledDate: new Date("2026-09-15T09:00:00Z"),
      },
    });
  });

  it("starts a BOOKED record (BOOKED -> IN_SERVICE) with no payload", () => {
    const result = transition(bookedRecord, "START");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe(ServiceStatus.IN_SERVICE);
      expect(result.patch.startedAt).toBeInstanceOf(Date);
    }
  });

  it("completes an IN_SERVICE record (IN_SERVICE -> COMPLETED) with an odometer at or above the vehicle's", () => {
    const result = transition(
      inServiceRecord,
      "COMPLETE",
      { completedOdometer: 100000 },
      vehicle
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.status).toBe(ServiceStatus.COMPLETED);
      expect(result.patch.completedAt).toBeInstanceOf(Date);
      expect(result.patch.completedOdometer).toBe(100000);
    }
  });
});

describe("transition: illegal transitions", () => {
  it("rejects booking a record that is already BOOKED", () => {
    const result = transition(bookedRecord, "BOOK", {
      scheduledDate: "2026-09-15T09:00:00Z",
      technicianId: "tech-1",
    });

    expect(result).toEqual({
      ok: false,
      reason: "Cannot book a record that is already BOOKED.",
    });
  });

  it("rejects starting a DUE record directly (no skipping booking)", () => {
    const result = transition(dueRecord, "START");

    expect(result).toEqual({
      ok: false,
      reason: "Cannot start a record that is DUE.",
    });
  });

  it("rejects moving a COMPLETED record anywhere", () => {
    const result = transition(completedRecord, "COMPLETE", {
      completedOdometer: 100000,
    });

    expect(result).toEqual({
      ok: false,
      reason: "Cannot move from COMPLETED to COMPLETE.",
    });
  });
});

describe("transition: payload guards", () => {
  it("rejects COMPLETE with a missing completedOdometer", () => {
    const result = transition(inServiceRecord, "COMPLETE", {}, vehicle);

    expect(result).toEqual({
      ok: false,
      reason: "Completing a service requires a completedOdometer reading.",
    });
  });

  it("rejects COMPLETE when the odometer is below the vehicle's current reading", () => {
    const result = transition(
      inServiceRecord,
      "COMPLETE",
      { completedOdometer: 99999 },
      vehicle
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("cannot be lower than the vehicle's current odometer");
    }
  });

  it("rejects BOOK without a scheduledDate or technician", () => {
    const result = transition(dueRecord, "BOOK", {});

    expect(result).toEqual({
      ok: false,
      reason: "Booking requires a scheduledDate and at least one technician.",
    });
  });
});
