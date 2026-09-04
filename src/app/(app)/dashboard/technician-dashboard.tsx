"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  Loader2Icon,
  WrenchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { notifyAlertCountChanged } from "@/lib/alert-events";
import type { TechnicianDashboardData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ServiceStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS, STATUS_BADGE_VARIANTS } from "@/components/service-records/records-table";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function TechnicianDashboard() {
  const [data, setData] = useState<TechnicianDashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // The record being acted on + the odometer dialog for COMPLETE.
  const [completing, setCompleting] = useState<{
    id: string;
    registrationNumber: string;
  } | null>(null);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [odometer, setOdometer] = useState("");
  const [odometerError, setOdometerError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiFetch<TechnicianDashboardData>("/api/dashboard")
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((error) =>
        setLoadError(
          error instanceof Error ? error.message : "Failed to load dashboard."
        )
      );
  }, []);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  async function runTransition(
    id: string,
    body: Record<string, unknown>
  ): Promise<boolean> {
    setTransitioningId(id);
    try {
      await apiFetch(`/api/service-records/${id}/transition`, {
        method: "POST",
        body,
      });
      toast.success(
        body.action === "START" ? "Service started" : "Service completed"
      );
      // A transition can clear/quiet an alert (completing a service moves the
      // vehicle to its next cycle) — keep the nav badge in sync.
      notifyAlertCountChanged();
      load();
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Transition failed."
      );
      return false;
    } finally {
      setTransitioningId(null);
    }
  }

  function startService(id: string) {
    runTransition(id, { action: "START" });
  }

  function openCompleteDialog(id: string, registrationNumber: string) {
    setOdometer("");
    setOdometerError(null);
    setCompleting({ id, registrationNumber });
  }

  async function submitComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!completing) return;
    const reading = Number(odometer);
    if (!Number.isFinite(reading) || reading < 0) {
      setOdometerError("Enter a valid odometer reading");
      return;
    }
    const ok = await runTransition(completing.id, {
      action: "COMPLETE",
      completedOdometer: reading,
    });
    if (ok) setCompleting(null);
  }

  const firstGreeting = greeting();
  const active = data?.assigned ?? [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
            Fleet maintenance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {firstGreeting}, {data?.technician.name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s assigned to you today.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{loadError}</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
            onClick={() => setRetryNonce((n) => n + 1)}
          >
            Retry
          </Button>
        </div>
      ) : data === null ? (
        <TechnicianSkeleton />
      ) : (
        <>
          {/* KPI tiles — each summarizes the technician's own workload. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Active jobs"
              value={data.stats.assignedCount}
              icon={
                <ClipboardListIcon className="size-4" aria-hidden />
              }
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            />
            <StatTile
              label="Due / overdue"
              value={data.stats.dueCount}
              icon={
                <CalendarClockIcon className="size-4" aria-hidden />
              }
              iconClass="bg-red-500/10 text-red-600 dark:text-red-400"
            />
            <StatTile
              label="In service"
              value={data.stats.inServiceCount}
              icon={<WrenchIcon className="size-4" aria-hidden />}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            />
            <StatTile
              label="Completed this week"
              value={data.stats.completedThisWeek}
              icon={
                <CheckCircle2Icon className="size-4" aria-hidden />
              }
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* My active assignments */}
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    My jobs
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Work currently assigned to you.
                  </p>
                </div>
                {active.length > 0 ? (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    {active.length} active
                  </span>
                ) : null}
              </div>

              {active.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2Icon className="size-5" aria-hidden />}
                  title="No active jobs"
                  hint="When a manager assigns work to you, it will show up here."
                />
              ) : (
                <ul className="space-y-3">
                  {active.map((record) => (
                    <li
                      key={record.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border bg-background/60 p-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/service-records/${record.id}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {record.vehicle.registrationNumber}
                          </Link>
                          <span className="text-sm text-muted-foreground">
                            {record.vehicle.make} {record.vehicle.model}
                          </span>
                          <Badge
                            variant={STATUS_BADGE_VARIANTS[record.status]}
                          >
                            {STATUS_LABELS[record.status]}
                          </Badge>
                        </div>
                        <p
                          className="mt-1 max-w-xl truncate text-sm text-muted-foreground"
                          title={record.description}
                        >
                          {record.description}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {record.status === ServiceStatus.BOOKED
                            ? `Scheduled ${formatDate(record.scheduledDate)}`
                            : record.status === ServiceStatus.IN_SERVICE
                              ? `Started ${formatDateTime(record.startedAt!)}`
                              : record.status === ServiceStatus.DUE
                                ? `Due since ${formatDate(record.dueSince)}`
                                : null}
                        </p>
                      </div>

                      {record.status === ServiceStatus.BOOKED ? (
                        <Button
                          size="sm"
                          onClick={() => startService(record.id)}
                          disabled={transitioningId === record.id}
                        >
                          {transitioningId === record.id ? (
                            <Loader2Icon
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <WrenchIcon className="size-4" aria-hidden />
                          )}
                          Start service
                        </Button>
                      ) : record.status === ServiceStatus.IN_SERVICE ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            openCompleteDialog(
                              record.id,
                              record.vehicle.registrationNumber
                            )
                          }
                          disabled={transitioningId === record.id}
                        >
                          <CheckCircle2Icon className="size-4" aria-hidden />
                          Complete
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recently completed */}
            <section className="rounded-2xl border bg-card p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">
                    Recently completed
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Your latest finished jobs.
                  </p>
                </div>
                {data.stats.completedAllTime > 0 ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {data.stats.completedAllTime} total
                  </span>
                ) : null}
              </div>

              {data.recentCompleted.length === 0 ? (
                <EmptyState
                  icon={<ClipboardListIcon className="size-5" aria-hidden />}
                  title="Nothing completed yet"
                  hint="Jobs you complete will be listed here."
                />
              ) : (
                <ul className="space-y-3">
                  {data.recentCompleted.map((job) => (
                    <li
                      key={job.id}
                      className="flex items-center gap-3 rounded-xl border bg-background/60 px-3.5 py-3"
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2Icon className="size-4" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {job.vehicle.registrationNumber}
                        </p>
                        <p
                          className="truncate text-xs text-muted-foreground"
                          title={job.description}
                        >
                          {job.description}
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted-foreground">
                        <p>{formatDateTime(job.completedAt)}</p>
                        {job.completedOdometer !== null ? (
                          <p>{job.completedOdometer.toLocaleString()} km</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {/* Complete-service odometer dialog */}
      <Dialog open={completing !== null} onOpenChange={(open) => !open && setCompleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Complete service</DialogTitle>
            <DialogDescription>
              Finish the service for{" "}
              <span className="font-medium text-foreground">
                {completing?.registrationNumber}
              </span>
              . Enter the current odometer reading.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitComplete} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tech-odometer">Odometer reading</Label>
              <Input
                id="tech-odometer"
                type="number"
                inputMode="numeric"
                min={0}
                value={odometer}
                onChange={(e) => {
                  setOdometer(e.target.value);
                  setOdometerError(null);
                }}
                placeholder="e.g. 84500"
                aria-invalid={Boolean(odometerError)}
                autoFocus
              />
              {odometerError ? (
                <p className="text-sm text-destructive">{odometerError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompleting(null)}
                disabled={transitioningId !== null}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={transitioningId !== null || odometer === ""}>
                {transitioningId !== null ? (
                  <>
                    <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    Completing…
                  </>
                ) : (
                  "Complete service"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A non-clicking summary tile for the technician dashboard. */
function StatTile({
  label,
  value,
  icon,
  iconClass,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  iconClass: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
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
          className="size-4 text-muted-foreground/40"
          aria-hidden
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
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
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function TechnicianSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
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
    </div>
  );
}
