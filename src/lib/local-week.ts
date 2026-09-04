/**
 * Calendar-week math in a given IANA timezone.
 *
 * "This week" and the per-week chart are bucketed by the *viewer's* calendar
 * week (Monday 00:00 local -> next Monday 00:00 local), because a completion
 * at 23:30 on Sunday belongs to next week for someone in UTC+5:30 even though
 * it is still "this week" in UTC. The old code bucketed everything in UTC,
 * which made the dashboard disagree with what the user saw on the calendar.
 *
 * These helpers are pure and timezone-explicit; the server resolves the zone
 * from an X-Timezone header the dashboard pages send (the browser knows the
 * user's real zone, the server does not). All date math is done on calendar
 * parts resolved through Intl, so results never depend on the server's own
 * local timezone.
 */

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

/** The calendar weekday of a CalendarDate: 0=Mon ... 6=Sun. */
function weekdayIndex(date: CalendarDate): number {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return (day + 6) % 7;
}

/** Shift a calendar date back to the Monday of its week. */
function mondayOf(date: CalendarDate): CalendarDate {
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day - weekdayIndex(date))
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
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

/** Date instant of Monday 00:00 local (in `timeZone`) for `instant`'s week. */
export function startOfLocalWeek(instant: Date, timeZone: string): Date {
  const monday = mondayOf(zonedDate(instant, timeZone));
  return new Date(utcMillisOfLocalMidnight(monday, timeZone));
}

/**
 * Date instant of the local midnight `days` whole calendar days after
 * `instant`'s date, in `timeZone`.
 */
export function addLocalDays(instant: Date, days: number, timeZone: string): Date {
  const date = zonedDate(instant, timeZone);
  const shifted = new Date(
    Date.UTC(date.year, date.month - 1, date.day + days)
  );
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

/**
 * The Monday-based key of the calendar week containing `instant`, as the wall
 * clock in `timeZone` sees it. Format: "2026-W36". The label is the local
 * calendar week, matching the axis labels a user expects.
 */
export function localWeekKey(instant: Date, timeZone: string): string {
  const monday = mondayOf(zonedDate(instant, timeZone));
  return isoWeekKeyOfDate(monday);
}

/**
 * The ISO week containing a date near a year boundary belongs to whichever
 * year holds that date's Thursday. Shift to the Thursday of the week first, so
 * the year used for the key is correct (e.g. 2020-12-28 -> 2021-W01).
 */
function isoWeekKeyOfDate(date: CalendarDate): string {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const dayNum = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of this week
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

/** A safe default when no timezone is supplied: UTC. */
export const DEFAULT_TIMEZONE = "UTC";

/**
 * Resolve an IANA timezone from an HTTP header value (e.g. X-Timezone),
 * falling back to UTC when absent or not a real zone.
 */
export function timezoneFromHeader(header: string | null): string {
  if (!header) return DEFAULT_TIMEZONE;
  try {
    // Throws RangeError for an unknown zone, e.g. "Not-a-zone".
    new Intl.DateTimeFormat("en-US", { timeZone: header });
    return header;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
