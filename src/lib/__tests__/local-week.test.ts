// Temporary sanity checks for lib/local-week across zones & DST.
import { describe, it, expect } from "vitest";
import {
  addLocalDays,
  localWeekKey,
  startOfLocalWeek,
} from "@/lib/local-week";

describe("local-week sanity", () => {
  it("Asia/Kolkata: local Monday of Sep 4 2026 = Aug 31 00:00 IST", () => {
    const now = new Date("2026-09-04T18:00:00Z"); // Sep 4 23:30 IST
    const monday = startOfLocalWeek(now, "Asia/Kolkata");
    expect(monday.toISOString()).toBe("2026-08-30T18:30:00.000Z");
    expect(localWeekKey(now, "Asia/Kolkata")).toBe("2026-W36");
    expect(addLocalDays(monday, 7, "Asia/Kolkata").toISOString()).toBe(
      "2026-09-06T18:30:00.000Z"
    );
  });

  it("UTC behaves like the old UTC ISO-week code", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    expect(localWeekKey(now, "UTC")).toBe("2026-W36");
    const monday = startOfLocalWeek(now, "UTC");
    expect(monday.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("New York: Sunday evening UTC still previous local week", () => {
    // 2026-08-30 23:00 UTC = Aug 30 19:00 EDT (Sunday) => local week W35
    const sun = new Date("2026-08-30T23:00:00Z");
    expect(localWeekKey(sun, "America/New_York")).toBe("2026-W35");
    // 2026-08-31 03:00 UTC = Aug 30 23:00 EDT (still Sunday) => W35
    const lateSun = new Date("2026-08-31T03:00:00Z");
    expect(localWeekKey(lateSun, "America/New_York")).toBe("2026-W35");
    // 2026-08-31 04:00 UTC = Aug 31 00:00 EDT (Monday) => W36
    const mon = new Date("2026-08-31T04:00:00Z");
    expect(localWeekKey(mon, "America/New_York")).toBe("2026-W36");
  });

  it("crosses the US DST spring-forward boundary cleanly", () => {
    // 2026 DST begins Mar 8 (2nd Sunday, 02:00 EST -> 03:00 EDT). The Monday
    // after, Mar 9 00:00 EDT = 04:00 UTC.
    const mon = new Date("2026-03-09T04:00:00Z");
    expect(localWeekKey(mon, "America/New_York")).toBe("2026-W11");
    const start = startOfLocalWeek(mon, "America/New_York");
    expect(start.toISOString()).toBe("2026-03-09T04:00:00.000Z");

    // The transition day itself (Sunday Mar 8): start of week is Mar 2 00:00 EST.
    const transDay = new Date("2026-03-08T15:00:00Z"); // Mar 8 11:00 EDT
    expect(localWeekKey(transDay, "America/New_York")).toBe("2026-W10");
    expect(startOfLocalWeek(transDay, "America/New_York").toISOString()).toBe(
      "2026-03-02T05:00:00.000Z"
    );
  });

  it("crosses the US DST fall-back boundary cleanly", () => {
    // 2026 DST ends Nov 1 (1st Sunday). Nov 2 Monday 00:00 EST = 05:00 UTC.
    const mon = new Date("2026-11-02T05:00:00Z");
    expect(localWeekKey(mon, "America/New_York")).toBe("2026-W45");
    const start = startOfLocalWeek(mon, "America/New_York");
    expect(start.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
