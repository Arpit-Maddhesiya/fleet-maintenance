import { NextResponse, type NextRequest } from "next/server";
import { auth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import {
  dailyReportQuerySchema,
  submitDailyReportSchema,
} from "@/lib/validation/daily-report";
import {
  addLocalDays,
  isBeforeLocalTime,
  localDayKey,
  localMidnightOf,
  localMidnightOfDayKey,
  timezoneFromHeader,
} from "@/lib/local-day";
import { Role, DailyReportType } from "@/generated/prisma/enums";

const REPORT_OPEN_HOUR = 17; // daily reports open at 5 PM local
const REPORT_OPEN_MINUTE = 0;

/** Author names resolved once per request, keyed by user id. */
type AuthorNameMap = Map<string, { id: string; name: string; role: Role }>;

function toDailyReportDto(report: {
  id: string;
  authorId: string;
  reportDate: Date;
  type: DailyReportType;
  jobsCompleted: number;
  hoursWorked: number;
  registrations: string;
  bookingsCount: number;
  inspectionsCount: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  author?: { id: string; name: string; role: Role };
}, authors?: AuthorNameMap) {
  // Prefer the relation when the query included it (single-author reads);
  // otherwise resolve from the request-wide author map.
  const author = report.author ?? authors?.get(report.authorId);
  return {
    id: report.id,
    authorId: report.authorId,
    authorName: author?.name ?? "Unknown",
    role: author?.role ?? report.type,
    reportDate: report.reportDate.toISOString(),
    type: report.type,
    jobsCompleted: report.jobsCompleted,
    hoursWorked: report.hoursWorked,
    registrations: report.registrations,
    bookingsCount: report.bookingsCount,
    inspectionsCount: report.inspectionsCount,
    notes: report.notes,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

/**
 * The users whose reports a caller may view, as an id->user map (also used to
 * resolve author names and drive the author filter):
 * - ADMIN: all fleet managers and technicians.
 * - FLEET_MANAGER: all technicians plus themselves.
 * - TECHNICIAN: handled by the GET caller before this is reached.
 */
async function reportableUsers(
  role: Role,
  selfId: string
): Promise<AuthorNameMap> {
  const roles: Role[] =
    role === Role.ADMIN
      ? [Role.FLEET_MANAGER, Role.TECHNICIAN]
      : [Role.TECHNICIAN];
  const users = await prisma.user.findMany({
    where: { role: { in: roles } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const map: AuthorNameMap = new Map(users.map((u) => [u.id, u]));
  if (role === Role.FLEET_MANAGER) {
    const me = await prisma.user.findUnique({
      where: { id: selfId },
      select: { id: true, name: true, role: true },
    });
    if (me) map.set(me.id, me);
  }
  return map;
}

// GET /api/daily-reports — any authenticated user.
// Role scoping: technicians see only their own report for the date; fleet
// managers see their own + all technicians'; admins see everyone's. The date
// filter (default today) and all "which day" logic follow the caller's local
// timezone (X-Timezone header).
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }
    const timeZone = timezoneFromHeader(request.headers.get("x-timezone"));
    const parsed = dailyReportQuerySchema.safeParse({
      date: request.nextUrl.searchParams.get("date") ?? undefined,
      authorId: request.nextUrl.searchParams.get("authorId") ?? undefined,
      history: request.nextUrl.searchParams.get("history") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { date, authorId, history } = parsed.data;

    const role = session.user.role;

    // A reporter's own recent reports (the "previous days" list). Scoped to
    // self regardless of role; admins don't file, so they don't get one.
    if (history === "true") {
      if (role === Role.ADMIN) {
        return NextResponse.json(
          { error: "Admins do not file daily reports." },
          { status: 403 }
        );
      }
      const mine = await prisma.dailyReport.findMany({
        where: { authorId: session.user.id },
        orderBy: { reportDate: "desc" },
        take: 30,
        include: { author: { select: { id: true, name: true, role: true } } },
      });
      return NextResponse.json({
        reports: mine.map((r) => toDailyReportDto(r)),
      });
    }

    const now = new Date();
    const todayKey = localDayKey(now, timeZone);
    const requestedKey = date ?? todayKey;
    const dayStart = localMidnightOfDayKey(requestedKey, timeZone);
    if (!dayStart) {
      return NextResponse.json(
        { error: "Invalid date.", details: { date: "Not a real calendar day." } },
        { status: 400 }
      );
    }
    const dayEnd = addLocalDays(dayStart, 1, timeZone);

    // Technicians only ever see their own report.
    if (role === Role.TECHNICIAN) {
      const mine = await prisma.dailyReport.findFirst({
        where: {
          authorId: session.user.id,
          reportDate: { gte: dayStart, lt: dayEnd },
        },
        include: { author: { select: { id: true, name: true, role: true } } },
      });
      return NextResponse.json({
        report: mine ? toDailyReportDto(mine) : null,
      });
    }

    const authors = await reportableUsers(role, session.user.id);
    // A caller may only ask for a specific author they can already see.
    const targetAuthorId =
      authorId && authors.has(authorId) ? authorId : undefined;

    const reports = await prisma.dailyReport.findMany({
      where: {
        reportDate: { gte: dayStart, lt: dayEnd },
        ...(targetAuthorId ? { authorId: targetAuthorId } : {}),
      },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: [{ authorId: "asc" }, { createdAt: "desc" }],
    });

    // The author filter options are the reportable set minus admins (admins
    // review; they don't file). Admins keep managers + technicians; managers
    // keep themselves + technicians.
    const authorsForFilter = [...authors.values()].filter(
      (u) =>
        u.id === session.user.id ||
        u.role === Role.TECHNICIAN ||
        role === Role.ADMIN
    );

    return NextResponse.json({
      date: requestedKey,
      reports: reports.map((r) => toDailyReportDto(r)),
      authors: authorsForFilter,
    });
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/daily-reports — FLEET_MANAGER or TECHNICIAN files/updates their
// report for today. Only allowed after 5 PM local (X-Timezone). Upserts on
// (authorId, local-midnight-of-today) so re-submitting edits today's report.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(
      Role.FLEET_MANAGER,
      Role.TECHNICIAN
    );
    const timeZone = timezoneFromHeader(request.headers.get("x-timezone"));
    const body = await request.json();
    const parsed = submitDailyReportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const role = session.user.role;
    if (role === Role.ADMIN) {
      // Admins are not reporters; they only review.
      return NextResponse.json(
        { error: "Admins do not file daily reports." },
        { status: 403 }
      );
    }

    const now = new Date();
    const open = !isBeforeLocalTime(now, REPORT_OPEN_HOUR, REPORT_OPEN_MINUTE, timeZone);
    if (!open) {
      return NextResponse.json(
        { error: "Daily reports open at 5 PM." },
        { status: 403 }
      );
    }

    const reportDate = localMidnightOf(now, timeZone);
    const data = parsed.data;

    // Only accept the form matching the caller's role.
    const expectedType =
      role === Role.TECHNICIAN ? DailyReportType.TECHNICIAN : DailyReportType.FLEET_MANAGER;
    if (data.reportType !== expectedType) {
      return NextResponse.json(
        { error: "Report type does not match your role." },
        { status: 403 }
      );
    }

    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, role: true },
    });

    // Map the discriminated payload to the shared column set. The role decides
    // which columns carry meaning; the others stay zero/empty.
    const payload =
      data.reportType === "TECHNICIAN"
        ? {
            type: DailyReportType.TECHNICIAN,
            jobsCompleted: data.jobsCompleted,
            hoursWorked: data.hoursWorked,
            registrations: data.registrations
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .join("\n"),
            notes: data.issues,
          }
        : {
            type: DailyReportType.FLEET_MANAGER,
            bookingsCount: data.bookingsCount,
            inspectionsCount: data.inspectionsCount,
            notes: data.notes,
          };

    const report = await prisma.dailyReport.upsert({
      where: {
        authorId_reportDate: {
          authorId: session.user.id,
          reportDate,
        },
      },
      create: { authorId: session.user.id, reportDate, ...payload },
      update: payload,
    });

    const selfMap: AuthorNameMap = new Map(
      me ? [[me.id, { id: me.id, name: me.name, role: me.role }]] : []
    );

    return NextResponse.json(
      { report: toDailyReportDto(report, selfMap) },
      { status: 201 }
    );
  } catch (error) {
    return handleError(error);
  }
}
