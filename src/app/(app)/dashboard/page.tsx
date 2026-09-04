"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { openCommandSearch } from "@/lib/command-search-events";
import type { DashboardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Role, ServiceStatus } from "@/generated/prisma/enums";
import { TechnicianDashboard } from "./technician-dashboard";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DUE: "Due",
  BOOKED: "Booked",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
};

// Consistent status → color mapping shared by the distribution and the
// per-week chart. Each status also carries an icon + label in the legend
// so color is never the only signal.
const STATUS_META: Record<
  ServiceStatus,
  { label: string; color: string; dot: string }
> = {
  DUE: { label: "Due", color: "#f59e0b", dot: "bg-amber-500" },
  BOOKED: { label: "Booked", color: "#3b82f6", dot: "bg-blue-500" },
  IN_SERVICE: { label: "In service", color: "#8b5cf6", dot: "bg-violet-500" },
  COMPLETED: { label: "Completed", color: "#22c55e", dot: "bg-emerald-500" },
};

const STATUS_ORDER = [
  ServiceStatus.DUE,
  ServiceStatus.BOOKED,
  ServiceStatus.IN_SERVICE,
  ServiceStatus.COMPLETED,
];

// Chart colors that resolve via the theme tokens so axes/grids/cursor
// adapt automatically in dark mode. Tooltips are fully custom (ChartTooltip)
// because the default Recharts tooltip hard-codes black item text.
const AXIS_COLOR = "var(--color-muted-foreground, #71717a)";
const GRID_COLOR = "var(--color-border, #e4e4e7)";
const CURSOR_FILL = "var(--color-accent, #f4f4f5)";

const EMPTY_CHART_HEIGHT = 240;

/** Format an ISO timestamp as a short local time, e.g. "2:41 PM". */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const { data: session, status } = useSession();

  // Technicians get their own personal dashboard — fleet-wide aggregates are
  // manager/admin concerns and would be misleading here. While the session
  // loads, avoid flashing the wrong view.
  if (status === "loading") {
    return <DashboardSkeleton />;
  }
  if (session?.user?.role === Role.TECHNICIAN) {
    return <TechnicianDashboard />;
  }
  return <ManagerDashboard />;
}

function ManagerDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // byTechnician is keyed by id; resolve to names via /api/technicians.
  const [technicianNames, setTechnicianNames] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch<DashboardData>("/api/dashboard", {
      // The API buckets "this week" and the per-week chart in the caller's
      // calendar week; tell it which zone the browser is in.
      headers: { "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone },
    })
      .then((d) => {
        setData(d);
        setLoadedAt(new Date().toISOString());
        setLoadError(null);
      })
      .catch((error) =>
        setLoadError(
          error instanceof Error ? error.message : "Failed to load dashboard."
        )
      );
  }, [retryNonce]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ id: string; name: string }[]>("/api/technicians")
      .then((list) => {
        if (cancelled) return;
        const names: Record<string, string> = {};
        for (const t of list) names[t.id] = t.name;
        setTechnicianNames(names);
      })
      .catch(() => {
        // Best-effort — the workload chart still renders with ids if this fails.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex max-w-2xl items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
      >
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">Couldn't load the dashboard</p>
          <p className="mt-0.5 text-red-600/90 dark:text-red-300/80">{loadError}</p>
        </div>
        <button
          type="button"
          onClick={() => setRetryNonce((n) => n + 1)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-500/10 dark:text-red-300"
        >
          <RefreshCwIcon className="size-3.5" aria-hidden />
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return <DashboardSkeleton />;
  }

  // The backend guarantees exactly 8 entries (zero-filled); render them
  // as-is so empty weeks still show as points/bars on the axis.
  const weeklyData = data.completedPerWeek.map((entry) => ({
    ...entry,
    // Short label: "2026-W36" -> "W36".
    label: entry.week.replace(/^\d{4}-W/, "W"),
  }));

  const statusData = STATUS_ORDER.map((status) => ({
    status,
    name: STATUS_LABELS[status],
    value: data.byStatus[status] ?? 0,
    color: STATUS_META[status].color,
    dot: STATUS_META[status].dot,
  }));

  const technicianData = Object.entries(data.byTechnician)
    .map(([id, count]) => ({
      name: technicianNames[id] ?? id.slice(0, 8),
      value: count,
    }))
    .sort((a, b) => b.value - a.value);

  const totalActiveAssignments = technicianData.reduce((sum, s) => sum + s.value, 0);
  const totalByStatus = statusData.reduce((sum, s) => sum + s.value, 0);
  // Lifetime count of COMPLETED records (also the status-distribution total).
  const totalCompleted = data.byStatus[ServiceStatus.COMPLETED] ?? 0;

  const firstGreeting = greeting();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
            Fleet maintenance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {firstGreeting}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s how your fleet&apos;s service is tracking today.
          </p>
        </div>
        {loadedAt ? (
          <p className="text-xs text-muted-foreground">
            Updated {formatTime(loadedAt)}
          </p>
        ) : null}
      </div>

      {/* Header row: a universal-search trigger (Ctrl+K also works anywhere). */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCommandSearch}
          className="group inline-flex h-9 w-full max-w-80 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:w-72"
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left">
            Search fleet, records, people…
          </span>
          <kbd className="hidden shrink-0 items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* KPI tiles — each deep-links to the pre-filtered records list. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href="/service-records?status=DUE"
          label="Due for service"
          value={data.dueCount}
          icon={<CalendarClockIcon className="size-4" aria-hidden />}
          iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
        />
        <StatCard
          href="/service-records?status=IN_SERVICE"
          label="In service"
          value={data.inServiceCount}
          icon={<WrenchIcon className="size-4" aria-hidden />}
          iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        />
        <StatCard
          href="/service-records?status=COMPLETED"
          label="Completed services"
          value={totalCompleted}
          icon={<CheckCircle2Icon className="size-4" aria-hidden />}
          iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        {/* Overdue is the operationally-critical one — visually distinct. */}
        <StatCard
          href="/service-records?overdue=true"
          label="Overdue"
          value={data.overdueCount}
          icon={<AlertTriangleIcon className="size-4" aria-hidden />}
          iconClass="bg-red-500/10 text-red-600 dark:text-red-400"
          className="border-red-500/30 bg-red-500/[0.04] hover:bg-red-500/[0.08]"
        />
      </div>

      {/* Status distribution + workload — side by side on wide screens. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Service status"
          description="All service records by current status."
          aside={`${totalByStatus} total`}
        >
          {totalByStatus === 0 ? (
            <ChartEmptyState
              icon={<ClipboardListIcon className="size-5" aria-hidden />}
              title="No service records yet"
              hint="Records will appear here once vehicles have service history."
            />
          ) : (
            <ResponsiveContainer width="100%" height={EMPTY_CHART_HEIGHT}>
              <BarChart data={statusData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke={GRID_COLOR}
                />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: CURSOR_FILL }}
                  content={
                    <ChartTooltip seriesName="Records" />
                  }
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                  {statusData.map((entry) => (
                    <Cell key={entry.status} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Active workload"
          description="Open assignments per technician."
          aside={`${totalActiveAssignments} assigned`}
        >
          {technicianData.length === 0 ? (
            <ChartEmptyState
              icon={<UsersIcon className="size-5" aria-hidden />}
              title="No active assignments"
              hint="Scheduled work for technicians will show up here."
            />
          ) : (
            <ResponsiveContainer width="100%" height={EMPTY_CHART_HEIGHT}>
              <BarChart data={technicianData} margin={{ left: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={GRID_COLOR}
                />
                <XAxis
                  dataKey="name"
                  interval={0}
                  tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: AXIS_COLOR, fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: CURSOR_FILL }}
                  content={
                    <ChartTooltip seriesName="Active assignments" />
                  }
                />
                <Bar
                  dataKey="value"
                  fill="var(--color-primary, #18181b)"
                  radius={[6, 6, 0, 0]}
                  barSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Completed per week — 8 points guaranteed by the backend. */}
      <ChartCard
        title="Completions per week"
        description="Service records completed in the last 8 ISO weeks."
        aside={
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            Last 8 weeks
          </span>
        }
      >
        <ResponsiveContainer width="100%" height={EMPTY_CHART_HEIGHT}>
          <BarChart data={weeklyData} margin={{ left: 8 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={GRID_COLOR}
            />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fill: AXIS_COLOR, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: AXIS_COLOR, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: CURSOR_FILL }}
              content={
                <ChartTooltip seriesName="Completed" />
              }
            />
            <Bar
              dataKey="count"
              name="Completed"
              fill="#f59e0b"
              radius={[6, 6, 0, 0]}
              barSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

/** Time-aware greeting used in the page header. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Theme-aware text color used by the custom tooltip. The default Recharts
// tooltip hard-codes black item text, which disappears on the dark popover.
const TOOLTIP_TEXT = "var(--color-popover-foreground, #18181b)";

/** Custom tooltip so item text uses the theme foreground instead of the
 * black that Recharts' default tooltip hard-codes. `name` is optional —
 * charts that show a single series label it via `seriesName`. */
function ChartTooltip({
  active,
  payload,
  label,
  seriesName,
  valueFormatter = (v: number) => String(v),
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: number | string; color?: string; dataKey?: string | number }>;
  label?: string | number;
  seriesName?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0];
  const value = typeof row.value === "number" ? row.value : Number(row.value);
  const color = row.color;
  return (
    <div
      style={{
        background: "var(--color-popover, #ffffff)",
        color: TOOLTIP_TEXT,
        border: "1px solid var(--color-border, #e4e4e7)",
        borderRadius: 12,
        boxShadow: "0 8px 24px -12px rgb(0 0 0 / 0.25)",
        fontSize: 13,
        padding: "10px 12px",
        whiteSpace: "nowrap",
      }}
    >
      {label != null && label !== "" ? (
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {color ? (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: color,
              display: "inline-block",
            }}
          />
        ) : null}
        <span>
          {seriesName ?? "Records"}
          <span style={{ fontWeight: 600 }}>: {valueFormatter(value)}</span>
        </span>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  description,
  aside,
  children,
}: {
  title: string;
  description: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
        {aside ? (
          <div className="shrink-0 text-xs text-muted-foreground">{aside}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ChartEmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  icon,
  iconClass,
  className,
}: {
  href: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  iconClass: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgb(0_0_0/0.25)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            iconClass
          )}
        >
          {icon}
        </span>
        <ArrowRightIcon
          className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground"
          aria-hidden
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="h-7 w-48 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-72 animate-pulse rounded-full bg-stone-200/80 dark:bg-stone-800/80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
        <div className="h-72 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
    </div>
  );
}
