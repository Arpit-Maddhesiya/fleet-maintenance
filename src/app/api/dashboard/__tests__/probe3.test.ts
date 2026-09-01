import { describe, it } from "vitest";

function startOfIsoWeek(weekKey: string): Date {
  const [year, week] = weekKey.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayOfWeek1 = new Date(jan4);
  mondayOfWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const result = new Date(mondayOfWeek1);
  result.setUTCDate(result.getUTCDate() + (week - 1) * 7);
  return result;
}

describe("startOfIsoWeek sanity", () => {
  it("2026-W36", () => {
    const d = startOfIsoWeek("2026-W36");
    console.log("2026-W36 start:", d.toISOString());
  });
});
