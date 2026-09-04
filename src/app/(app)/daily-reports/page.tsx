"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  FileTextIcon,
  RefreshCwIcon,
  UsersIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { isBeforeLocalTime, localDayKey } from "@/lib/local-day";
import { Role } from "@/generated/prisma/enums";
import type {
  DailyReportDto,
  DailyReportHistoryResponse,
  DailyReportResponse,
  DailyReportsListResponse,
} from "@/lib/types";
import {
  ManagerReportForm,
  ManagerReportLockedState,
} from "@/components/daily-reports/manager-report-form";
import {
  ReportLockedState,
  TechnicianReportForm,
} from "@/components/daily-reports/technician-report-form";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The timezone-aware X-Timezone header every report request needs. */
const TZ_HEADERS = { "X-Timezone": timeZone };

/** "5:00 PM" style label for the lock message. */
function formatOpenTime(): string {
  return "5:00 PM";
}

const reportsOpen = () => !isBeforeLocalTime(new Date(), 17, 0, timeZone);

function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DailyReportsPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <PageSkeleton />;
  }
  const role = session?.user?.role;
  if (!role) return null;
  if (role === Role.TECHNICIAN) return <TechnicianDailyReports />;
  return <ManagerOrAdminDailyReports isAdmin={role === Role.ADMIN} />;
}

/** Shared section header used by both role views. */
function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
          Fleet maintenance
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Card shell with an h2 title + optional aside, matching dashboard ChartCard. */
function Card({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="shrink-0 text-xs text-muted-foreground">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
    >
      <RefreshCwIcon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{message}</span>
      <Button
        variant="outline"
        size="sm"
        className="border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="h-4 w-28 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
      <div className="h-7 w-48 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />
      <div className="h-72 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Technician view — today's report (form or locked) + past reports.   */
/* ------------------------------------------------------------------ */

function TechnicianDailyReports() {
  const [todayReport, setTodayReport] = useState<DailyReportDto | null>(null);
  const [history, setHistory] = useState<DailyReportDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const open = reportsOpen();

  const load = useCallback(async () => {
    try {
      const todayKey = localDayKey(new Date(), timeZone);
      const [todayRes, historyRes] = await Promise.all([
        apiFetch<DailyReportResponse>(
          `/api/daily-reports?date=${todayKey}`,
          { headers: TZ_HEADERS }
        ),
        apiFetch<DailyReportHistoryResponse>("/api/daily-reports?history=true", {
          headers: TZ_HEADERS,
        }),
      ]);
      setTodayReport(todayRes.report);
      setHistory(historyRes.reports);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load your reports."
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  const todayKey = localDayKey(new Date(), timeZone);
  const pastReports = useMemo(
    () =>
      (history ?? []).filter(
        (r) => localDayKey(new Date(r.reportDate), timeZone) !== todayKey
      ),
    [history, todayKey]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily reports"
        description="File your end-of-day work summary so the fleet manager has the full picture."
      />

      {loadError ? (
        <ErrorBanner message={loadError} onRetry={() => setRetryNonce((n) => n + 1)} />
      ) : (
        <>
          <Card
            title="Today's report"
            description={
              open
                ? "Your summary for today — editable until midnight."
                : "Reports open after 5 PM."
            }
            aside={
              todayReport ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2Icon className="size-3.5" aria-hidden />
                  Filed
                </span>
              ) : null
            }
          >
            {!open ? (
              <ReportLockedState openTime={formatOpenTime()} />
            ) : (
              <TechnicianReportForm existing={todayReport} onSaved={setTodayReport} />
            )}
          </Card>

          <Card
            title="Past reports"
            description="Your previously filed daily reports."
            aside={
              history && history.length > 0
                ? `${history.length} filed`
                : undefined
            }
          >
            {pastReports.length === 0 ? (
              <EmptyState
                icon={<ClipboardListIcon className="size-5" aria-hidden />}
                title="No past reports yet"
                hint="Reports you file will be listed here."
              />
            ) : (
              <ul className="space-y-2">
                {pastReports.map((report) => (
                  <PastReportRow key={report.id} report={report} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** A read-only past report line with a disclosure for the details. */
function PastReportRow({ report }: { report: DailyReportDto }) {
  const [expanded, setExpanded] = useState(false);
  const isManagerType = report.type === "FLEET_MANAGER";
  const summary = isManagerType
    ? `${report.bookingsCount} booked · ${report.inspectionsCount} inspected`
    : `${report.jobsCompleted} jobs · ${report.hoursWorked}h${
        report.registrations ? ` · ${report.registrations.split("\n").length} vehicle(s)` : ""
      }`;
  return (
    <li className="rounded-xl border bg-background/60">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {formatReportDate(report.reportDate)}
          </p>
          <p className="truncate text-xs text-muted-foreground">{summary}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          Filed {formatTime(report.updatedAt)}
        </span>
      </button>
      {expanded ? (
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          {report.notes ? (
            <p className="whitespace-pre-wrap">{report.notes}</p>
          ) : (
            <p>No notes.</p>
          )}
          {!isManagerType && report.registrations ? (
            <p className="mt-2 whitespace-pre-wrap text-xs">
              Vehicles: {report.registrations.replace(/\n/g, ", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Manager / Admin view — a date-filtered list of the day's reports.   */
/* ------------------------------------------------------------------ */

function ManagerOrAdminDailyReports({ isAdmin }: { isAdmin: boolean }) {
  const [date, setDate] = useState(() => localDayKey(new Date(), timeZone));
  const [authorId, setAuthorId] = useState<string>("__all");
  const [data, setData] = useState<DailyReportsListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // The logged-in manager/admin's own report card.
  const [myToday, setMyToday] = useState<DailyReportDto | null>(null);
  const myOpen = reportsOpen();
  const isManagerViewingSelf = !isAdmin;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ date });
    if (authorId !== "__all") params.set("authorId", authorId);
    try {
      const [listRes, myRes] = await Promise.all([
        apiFetch<DailyReportsListResponse>(`/api/daily-reports?${params}`, {
          headers: TZ_HEADERS,
        }),
        // Managers file their own report too; admins don't.
        isManagerViewingSelf
          ? apiFetch<DailyReportResponse>(
              `/api/daily-reports?date=${localDayKey(new Date(), timeZone)}`,
              { headers: TZ_HEADERS }
            )
          : Promise.resolve(null),
      ]);
      setData(listRes);
      setMyToday(myRes?.report ?? null);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load daily reports."
      );
    }
  }, [date, authorId, isManagerViewingSelf]);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  // When the manager picks an author in the filter, the sidebar still shows
  // their own "today" card (managers always file their own).
  const reports = data?.reports ?? [];
  const authors = data?.authors ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily reports"
        description={
          isAdmin
            ? "Review the daily reports your managers and technicians file after 5 PM."
            : "Review the day's reports from your technicians, and file your own."
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <CalendarDaysIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="date"
            value={date}
            max={localDayKey(new Date(), timeZone)}
            onChange={(e) => {
              if (e.target.value) {
                setDate(e.target.value);
                setAuthorId("__all");
              }
            }}
            aria-label="Report date"
            className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-48 dark:bg-input/30"
          />
        </div>

        {authors.length > 1 ? (
          <Select
            value={authorId}
            onValueChange={(v) => setAuthorId(v)}
          >
            <SelectTrigger size="sm" className="min-w-44 bg-card">
              <UsersIcon className="size-3.5 text-muted-foreground" aria-hidden />
              <SelectValue placeholder="All authors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All authors</SelectItem>
              {authors.map((author) => (
                <SelectItem key={author.id} value={author.id}>
                  {author.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {loadError ? (
        <ErrorBanner message={loadError} onRetry={() => setRetryNonce((n) => n + 1)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column: the day's reports. */}
          <div className="space-y-6 lg:col-span-2">
            {data === null ? (
              <div className="h-64 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
            ) : reports.length === 0 ? (
              <EmptyState
                icon={<FileTextIcon className="size-5" aria-hidden />}
                title="No reports for this day"
                hint={
                  authorId !== "__all"
                    ? "This person hasn't filed a report for the selected date."
                    : "Nobody has filed a report for the selected date yet."
                }
              />
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <ReportCard key={report.id} report={report} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: the logged-in manager's own report (not for admins). */}
          {isManagerViewingSelf ? (
            <div className="lg:col-span-1">
              <Card
                title="Your report"
                description={
                  myOpen
                    ? "File or update your own summary for today."
                    : "Reports open after 5 PM."
                }
              >
                {!myOpen ? (
                  <ManagerReportLockedState openTime={formatOpenTime()} />
                ) : (
                  <ManagerReportForm existing={myToday} onSaved={setMyToday} />
                )}
              </Card>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A read-only rendered report in the manager/admin list. */
function ReportCard({ report }: { report: DailyReportDto }) {
  const [expanded, setExpanded] = useState(false);
  const isTech = report.type === "TECHNICIAN";
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{report.authorName}</p>
            <span
              className={
                isTech
                  ? "rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-600 dark:text-violet-400"
                  : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
              }
            >
              {isTech ? "Technician" : "Fleet manager"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Filed {formatReportDate(report.reportDate)} at {formatTime(report.updatedAt)}
          </p>
        </div>
        {isTech ? (
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">{report.jobsCompleted}</p>
              <p className="text-xs text-muted-foreground">Jobs</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">{report.hoursWorked}</p>
              <p className="text-xs text-muted-foreground">Hours</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">{report.bookingsCount}</p>
              <p className="text-xs text-muted-foreground">Booked</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold tabular-nums">{report.inspectionsCount}</p>
              <p className="text-xs text-muted-foreground">Inspected</p>
            </div>
          </div>
        )}
      </div>

      {report.notes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {report.notes}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground/70">No notes.</p>
      )}

      {isTech && report.registrations ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            {expanded ? "Hide vehicles" : "Show vehicles worked on"}
          </button>
          {expanded ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {report.registrations.split("\n").map((reg) => (
                <span
                  key={reg}
                  className="rounded-md border bg-background/60 px-2 py-0.5 font-mono text-xs"
                >
                  {reg}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
