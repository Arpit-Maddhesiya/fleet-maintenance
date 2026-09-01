import { describe, it } from "vitest";
import * as route from "@/app/api/dashboard/route";

describe("route internals", () => {
  it("probes isoWeekKey/startOfIsoWeek as imported", () => {
    const mod = route as unknown as {
      isoWeekKey?: (d: Date) => string;
      startOfIsoWeek?: (k: string) => Date;
    };
    console.log("exports:", Object.keys(route).join(","));
    console.log(
      "isoWeekKey(2026-09-01):",
      mod.isoWeekKey?.(new Date("2026-09-01T00:00:00Z"))
    );
    console.log(
      "startOfIsoWeek(2026-W36):",
      mod.startOfIsoWeek?.("2026-W36")?.toISOString()
    );
  });
});
