import { describe, it } from "vitest";

function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayNum = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to Thursday of this week
  const isoYear = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() + 4 - jan4Day); // Thursday of ISO week 1
  const week =
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / 86400000 - 3 + (((jan4Day + 4) % 7) - 3)) / 7
    );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

describe("isoWeekKey sanity", () => {
  it("known weeks", () => {
    const cases: [string, string][] = [
      ["2026-08-31T00:00:00Z", "2026-W36"], // Monday
      ["2026-09-01T00:00:00Z", "2026-W36"],
      ["2026-09-06T00:00:00Z", "2026-W36"], // Sunday
      ["2026-09-07T00:00:00Z", "2026-W37"], // next Monday
      ["2026-01-01T00:00:00Z", "2026-W01"],
      ["2025-12-29T00:00:00Z", "2026-W01"], // Monday in ISO 2026-W01
      ["2025-12-28T00:00:00Z", "2025-W52"],
    ];
    for (const [iso, expected] of cases) {
      const got = isoWeekKey(new Date(iso));
      console.log(`${iso} -> ${got} (expected ${expected}) ${got === expected ? "OK" : "MISMATCH"}`);
    }
  });
});
