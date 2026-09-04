import { describe, it, expect } from "vitest";
import {
  addLocalDays,
  isBeforeLocalTime,
  localDayKey,
  localMidnightOf,
  localMidnightOfDayKey,
} from "@/lib/local-day";

describe("local-day sanity", () => {
  it("Asia/Kolkata: local midnight of Sep 4 2026 23:30 IST = Aug 30 18:30Z", () => {
    const now = new Date("2026-09-04T18:00:00Z"); // Sep 4 23:30 IST
    expect(localMidnightOf(now, "Asia/Kolkata").toISOString()).toBe(
      "2026-09-03T18:30:00.000Z"
    );
    expect(localDayKey(now, "Asia/Kolkata")).toBe("2026-09-04");
    // One local day later is Sep 5 00:00 IST = Sep 4 18:30Z.
    expect(addLocalDays(now, 1, "Asia/Kolkata").toISOString()).toBe(
      "2026-09-04T18:30:00.000Z"
    );
  });

  it("UTC behaves like the old UTC day math", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    expect(localDayKey(now, "UTC")).toBe("2026-09-04");
    expect(localMidnightOf(now, "UTC").toISOString()).toBe(
      "2026-09-04T00:00:00.000Z"
    );
  });

  it("New York: Sunday evening UTC is still the local Sunday until 04:00Z Monday", () => {
    // 2026-08-30 23:00Z = Aug 30 19:00 EDT (Sunday)
    const sun = new Date("2026-08-30T23:00:00Z");
    expect(localDayKey(sun, "America/New_York")).toBe("2026-08-30");
    // 2026-08-31 03:00Z = Aug 30 23:00 EDT (still Sunday)
    const lateSun = new Date("2026-08-31T03:00:00Z");
    expect(localDayKey(lateSun, "America/New_York")).toBe("2026-08-30");
    // 2026-08-31 04:00Z = Aug 31 00:00 EDT (Monday)
    const mon = new Date("2026-08-31T04:00:00Z");
    expect(localDayKey(mon, "America/New_York")).toBe("2026-08-31");
    expect(localMidnightOf(mon, "America/New_York").toISOString()).toBe(
      "2026-08-31T04:00:00.000Z"
    );
  });

  it("crosses the US DST spring-forward boundary cleanly", () => {
    // 2026 DST begins Mar 8 (2nd Sunday). Mar 9 00:00 EDT = 04:00Z.
    const mon = new Date("2026-03-09T04:00:00Z");
    expect(localDayKey(mon, "America/New_York")).toBe("2026-03-09");
    expect(localMidnightOf(mon, "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z"
    );
    // The transition day itself (Sunday Mar 8) started at 00:00 EST (05:00Z).
    const transDay = new Date("2026-03-08T15:00:00Z"); // Mar 8 11:00 EDT
    expect(localDayKey(transDay, "America/New_York")).toBe("2026-03-08");
    expect(localMidnightOf(transDay, "America/New_York").toISOString()).toBe(
      "2026-03-08T05:00:00.000Z"
    );
  });

  it("crosses the US DST fall-back boundary cleanly", () => {
    // 2026 DST ends Nov 1. Nov 2 00:00 EST = 05:00Z.
    const mon = new Date("2026-11-02T05:00:00Z");
    expect(localDayKey(mon, "America/New_York")).toBe("2026-11-02");
    expect(localMidnightOf(mon, "America/New_York").toISOString()).toBe(
      "2026-11-02T05:00:00.000Z"
    );
  });

  it("round-trips day keys through localMidnightOfDayKey", () => {
    const tz = "Asia/Kolkata";
    expect(localDayKey(localMidnightOfDayKey("2026-09-04", tz)!, tz)).toBe(
      "2026-09-04"
    );
    // Exact local midnight instant.
    expect(localMidnightOfDayKey("2026-09-04", tz)!.toISOString()).toBe(
      "2026-09-03T18:30:00.000Z"
    );
  });

  it("rejects impossible day keys", () => {
    expect(localMidnightOfDayKey("2026-02-30", "UTC")).toBeNull();
    expect(localMidnightOfDayKey("2026-13-01", "UTC")).toBeNull();
    expect(localMidnightOfDayKey("garbage", "UTC")).toBeNull();
    expect(localMidnightOfDayKey("2026-9-4", "UTC")).toBeNull(); // must be padded
  });

  it("isBeforeLocalTime compares the local wall clock", () => {
    // 2026-09-04 16:59:59 UTC = Sep 4 22:29:59 IST -> after 5 PM IST.
    const beforeIst = new Date("2026-09-04T11:29:59Z");
    expect(isBeforeLocalTime(beforeIst, 17, 0, "Asia/Kolkata")).toBe(true);
    // 2026-09-04 11:30:00 UTC = Sep 4 17:00:00 IST exactly -> not before 5 PM.
    const atIst = new Date("2026-09-04T11:30:00Z");
    expect(isBeforeLocalTime(atIst, 17, 0, "Asia/Kolkata")).toBe(false);
    // New York: 2026-01-15 21:59Z = 16:59 EST (before 5 PM); 22:00Z = 17:00 EST.
    const beforeNy = new Date("2026-01-15T21:59:00Z");
    expect(isBeforeLocalTime(beforeNy, 17, 0, "America/New_York")).toBe(true);
    const atNy = new Date("2026-01-15T22:00:00Z");
    expect(isBeforeLocalTime(atNy, 17, 0, "America/New_York")).toBe(false);
  });
});
