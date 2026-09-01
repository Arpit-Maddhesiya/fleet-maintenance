"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  WrenchIcon,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import type { DashboardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ServiceStatus } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DUE: "Due",
  BOOKED: "Booked",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
};

// Consistent status → color mapping shared by the distribution and the
// per-week chart.
const STATUS_COLORS: Record<ServiceStatus, string> = {
  DUE: "#f59e0b", // amber
  BOOKED: "#3b82f6", // blue
  IN_SERVICE: "#8b5cf6", // violet
  COMPLETED: "#22c55e", // green
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // byTechnician is keyed by id; resolve to names via /api/technicians.
  const [technicianNames, setTechnicianNames] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch<DashboardData>("/api/dashboard")
      .then(setData)
      .catch((error) =>
        setLoadError(error instanceof Error ? error.message : "Failed to load dashboard.")
      );
  }, []);

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
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {loadError}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  // The backend guarantees exactly 8 entries (zero-filled); render them
  // as-is so empty weeks still show as points/bars on the axis.
  const weeklyData = data.completedPerWeek.map((entry) => ({
    ...entry,
    // Short label: "2026-W36" -> "W36".
    label: entry.week.replace(/^\d{4}-W/, "W"),
  }));

  const statusData = (Object.keys(STATUS_LABELS) as ServiceStatus[]).map(
    (status) => ({
      name: STATUS_LABELS[status],
      value: data.byStatus[status] ?? 0,
      color: STATUS_COLORS[status],
    })
  );

  const technicianData = Object.entries(data.byTechnician)
    .map(([id, count]) => ({
      name: technicianNames[id] ?? id.slice(0, 8),
      value: count,
    }))
    .sort((a, b) => b.value - a.value);

  const totalByStatus = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Fleet service status at a glance.
        </p>
      </div>

      {/* Headline stats — each deep-links to the pre-filtered records list. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href="/service-records?status=DUE"
          label="Due for Service"
          value={data.dueCount}
          icon={<CalendarClockIcon className="size-4" />}
          accent="text-amber-600"
        />
        <StatCard
          href="/service-records?status=IN_SERVICE"
          label="In Service"
          value={data.inServiceCount}
          icon={<WrenchIcon className="size-4" />}
          accent="text-violet-600"
        />
        <StatCard
          href="/service-records?status=COMPLETED"
          label="Completed This Week"
          value={data.completedThisWeek}
          icon={<CheckCircle2Icon className="size-4" />}
          accent="text-emerald-600"
        />
        {/* Overdue is the operationally-critical one — visually distinct. */}
        <StatCard
          href="/service-records?status=DUE"
          label="Overdue"
          value={data.overdueCount}
          icon={<AlertTriangleIcon className="size-4" />}
          accent="text-red-600"
          className="border-red-500/60 bg-red-500/5"
        />
      </div>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Status distribution</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={90} />
              <Tooltip formatter={(v) => [v, "Records"]} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {statusData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-4 text-lg font-semibold">Workload by technician</h2>
          {technicianData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No active assignments right now.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={technicianData} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" interval={0} tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v) => [v, "Active assignments"]} />
                <Bar dataKey="value" fill="var(--color-primary, #18181b)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Completed per week — 8 points guaranteed by the backend. */}
      <div className="rounded-md border bg-card p-4">
        <h2 className="mb-1 text-lg font-semibold">Completions per week</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Last 8 ISO weeks — weeks with zero completions still appear.
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={weeklyData} margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" interval={0} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} />
            <Tooltip formatter={(v) => [v, "Completed"]} />
            <Legend />
            <Bar dataKey="count" name="Completed" fill="var(--color-primary, #18181b)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  icon,
  accent,
  className,
}: {
  href: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-md border bg-card p-4 transition-colors hover:bg-accent/50",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={accent}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </Link>
  );
}
