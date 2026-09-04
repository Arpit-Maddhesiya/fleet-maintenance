"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BellOffIcon,
  BellRingIcon,
  CheckIcon,
  RefreshCwIcon,
  TruckIcon,
  Loader2Icon,
  AlertTriangleIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { notifyAlertCountChanged } from "@/lib/alert-events";
import { isManagerRole } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";
import { RoleRestrictedPage } from "@/lib/role-restricted-page";
import type { Alert, AlertsResponse } from "@/lib/types";

/** Whole days elapsed since an ISO date string, floored ("2 days"). */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/** "9 days overdue" — singular handling, zero days just says "overdue today". */
function overdueLabel(iso: string): string {
  const days = daysSince(iso);
  return days === 0 ? "overdue today" : `${days} day${days === 1 ? "" : "s"} overdue`;
}

/** Short date, e.g. "Sep 2". */
function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function AlertsPage() {
  return (
    <RoleRestrictedPage allowedRoles={[Role.FLEET_MANAGER, Role.ADMIN]}>
      <AlertsPageContent />
    </RoleRestrictedPage>
  );
}

function AlertsPageContent() {
  const { data: session } = useSession();
  const isManager = isManagerRole(session?.user?.role);

  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  // The alert being confirmed for dismissal (opens the confirmation modal).
  const [dismissTarget, setDismissTarget] = useState<Alert | null>(null);
  // Bumping this re-runs the fetch effect — the retry affordance.
  const [retryNonce, setRetryNonce] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<AlertsResponse>("/api/alerts");
      setAlerts(data.alerts);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load alerts."
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  async function dismiss(alert: Alert) {
    setDismissingId(alert.id);
    setDismissTarget(null);
    try {
      await apiFetch(`/api/alerts/${alert.id}/dismiss`, { method: "POST" });
      // Optimistic removal: the row is gone from the list immediately and the
      // count refetch (which is authoritative) happens in the background.
      setAlerts((current) => current?.filter((a) => a.id !== alert.id) ?? null);
      notifyAlertCountChanged();
      toast.success(
        `Alert dismissed for ${alert.vehicle.registrationNumber}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to dismiss alert."
      );
    } finally {
      setDismissingId(null);
    }
  }

  const count = alerts?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
            Fleet maintenance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vehicles that have passed their service due date.
          </p>
        </div>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          <RefreshCwIcon className="size-4 shrink-0" aria-hidden />
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
      ) : alerts === null ? (
        // Skeleton while the first fetch is in flight.
        <div className="space-y-3" aria-hidden>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800"
            />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <BellOffIcon className="size-7" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              No active alerts
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Every vehicle is up to date. We&apos;ll let you know the moment
              anything falls behind.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary line */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {count} vehicle{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""}{" "}
              attention
            </p>
            <Badge
              variant="destructive"
              className="gap-1.5 rounded-full px-2.5 py-1"
            >
              <BellRingIcon className="size-3.5" aria-hidden />
              {count} active
            </Badge>
          </div>

          <ul className="space-y-3">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-card p-4 sm:gap-4"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
                  <BellRingIcon className="size-5" aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/vehicles/${alert.vehicleId}`}
                      className="font-medium text-foreground hover:text-red-600 hover:underline dark:hover:text-red-400"
                    >
                      {alert.vehicle.registrationNumber}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {alert.vehicle.make} {alert.vehicle.model}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-red-600 dark:text-red-400">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <BellRingIcon className="size-3.5" aria-hidden />
                      {overdueLabel(alert.triggeredAt)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      triggered {formatShortDate(alert.triggeredAt)}
                    </span>
                  </p>
                </div>

                {isManager ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dismissingId === alert.id}
                    onClick={() => setDismissTarget(alert)}
                    className="shrink-0 border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
                  >
                    <CheckIcon className="size-4" aria-hidden />
                    {dismissingId === alert.id ? "Dismissing…" : "Dismiss"}
                  </Button>
                ) : (
                  <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:flex">
                    <TruckIcon className="size-4 shrink-0" aria-hidden />
                    Awaiting manager
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Dismiss confirmation — a destructive action gets an explicit
          confirm step (same pattern as the delete-user confirmation). */}
      <AlertDialog
        open={Boolean(dismissTarget)}
        onOpenChange={(open) => !open && setDismissTarget(null)}
      >
        <AlertDialogContent className="sm:max-w-md">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
              <BellOffIcon className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogHeader className="gap-1.5">
                <AlertDialogTitle>Dismiss alert?</AlertDialogTitle>
                {dismissTarget ? (
                  <AlertDialogDescription>
                    You&apos;re about to dismiss the overdue alert for{" "}
                    <span className="font-medium text-foreground">
                      {dismissTarget.vehicle.registrationNumber}
                    </span>{" "}
                    ({dismissTarget.vehicle.make}{" "}
                    {dismissTarget.vehicle.model}). The vehicle will stop
                    appearing in this list until its next service cycle.
                  </AlertDialogDescription>
                ) : (
                  <AlertDialogDescription>
                    The vehicle will stop appearing in this list until its next
                    service cycle.
                  </AlertDialogDescription>
                )}
              </AlertDialogHeader>

              <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  Dismissing only hides the alert — it doesn&apos;t change the
                  vehicle&apos;s service status. The alert will return after the
                  next service cycle if the vehicle is still due.
                </p>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setDismissTarget(null)}
              disabled={dismissingId !== null}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (dismissTarget) dismiss(dismissTarget);
              }}
              disabled={dismissingId !== null}
              className="bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60"
            >
              {dismissingId !== null ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  Dismissing…
                </>
              ) : (
                <>
                  <BellOffIcon className="size-4" aria-hidden />
                  Dismiss alert
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
