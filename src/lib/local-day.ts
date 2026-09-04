/**
 * Calendar-day math in a given IANA timezone.
 *
 * The daily-report feature keys each report to the author's *local* calendar
 * day ("reportDate" = the UTC instant of local midnight), and the "daily
 * reports open at 5 PM" gate is a local wall-clock rule. Like local-week.ts,
 * every helper here is pure and timezone-explicit; the server resolves the
 * zone from an X-Timezone header. All math is done on calendar parts resolved
 * through Intl so results never depend on the server's own local timezone.
 */

import { DEFAULT_TIMEZONE } from "./local-week";

/** A calendar date (month is 1-12) as the wall clock in a zone sees it. */
interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** The calendar date (y/m/d) of `instant` in `timeZone`. */
function zonedDate(instant: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : Number.NaN;
  };
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * The wall-clock time at `instant` in `timeZone` re-read as if it were UTC —
 * i.e. the epoch ms that the zone's wall clock would have at `instant` if the
 * zone were UTC. `wallClockAsUtc(instant) - instant` is therefore the zone's
 * UTC offset at that instant.
 */
function wallClockAsUtc(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : Number.NaN;
  };
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // hour can read "24" at midnight in some locales
    get("minute"),
    get("second")
  );
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads the given
 * calendar date at 00:00:00. Converges within a couple of iterations even
 * across a DST transition by re-measuring the offset at the current guess.
 */
function utcMillisOfLocalMidnight(date: CalendarDate, timeZone: string): number {
  const naiveMidnight = Date.UTC(date.year, date.month - 1, date.day);
  let guess = naiveMidnight;
  for (let i = 0; i < 4; i++) {
    const offset = wallClockAsUtc(new Date(guess), timeZone) - guess;
    const corrected = naiveMidnight - offset;
    if (corrected === guess) break;
    guess = corrected;
  }
  return guess;
}

/**
 * The local wall-clock time of `instant` in `timeZone` as minutes since local
 * midnight (0..1439). Used for cutoff checks like "after 5 PM".
 */
function localMinutesSinceMidnight(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : Number.NaN;
  };
  return (get("hour") % 24) * 60 + get("minute");
}

/** Date instant of local midnight of the local calendar day containing `instant`. */
export function localMidnightOf(instant: Date, timeZone: string): Date {
  const date = zonedDate(instant, timeZone);
  return new Date(utcMillisOfLocalMidnight(date, timeZone));
}

/**
 * "YYYY-MM-DD" key of the local calendar day containing `instant`, as the wall
 * clock in `timeZone` sees it (e.g. "2026-09-04"). Used as the date-filter URL
 * param and for the one-per-day identity.
 */
export function localDayKey(instant: Date, timeZone: string): string {
  const { year, month, day } = zonedDate(instant, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Inverse of localDayKey: the UTC instant of local midnight of the calendar
 * day `key` in `timeZone`. Returns null when `key` is not a real "YYYY-MM-DD"
 * calendar date (e.g. "2026-02-30"), so callers can 400 on garbage input.
 */
export function localMidnightOfDayKey(key: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Reject impossible dates via the calendar itself: round-trip the key through
  // the zone and confirm it lands on the same calendar day.
  const instant = new Date(utcMillisOfLocalMidnight({ year, month, day }, timeZone));
  if (localDayKey(instant, timeZone) !== key) return null;
  return instant;
}

/**
 * Whether `instant`'s local wall-clock time in `timeZone` is strictly before
 * `hour:minute` local. e.g. isBeforeLocalTime(now, 17, 0, tz) === true means
 * "still before 5 PM local", so reports are locked.
 */
export function isBeforeLocalTime(
  instant: Date,
  hour: number,
  minute: number,
  timeZone: string
): boolean {
  return localMinutesSinceMidnight(instant, timeZone) < hour * 60 + minute;
}

/** Date instant of local midnight `days` whole calendar days after `instant`'s local day. */
export function addLocalDays(instant: Date, days: number, timeZone: string): Date {
  const date = zonedDate(instant, timeZone);
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return new Date(
    utcMillisOfLocalMidnight(
      {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
      },
      timeZone
    )
  );
}

/** Resolve an IANA timezone from a header value, falling back to UTC. */
export function timezoneFromHeader(header: string | null): string {
  if (!header) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: header });
    return header;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
