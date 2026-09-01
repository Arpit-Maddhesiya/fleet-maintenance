"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellOffIcon, BellRingIcon, CheckIcon, TruckIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { notifyAlertCountChanged } from "@/lib/alert-events";
import type { Alert, AlertsResponse } from "@/lib/types";
import { Role } from "@/generated/prisma/enums";

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

export default function AlertsPage() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === Role.FLEET_MANAGER;

  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

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
  }, [load]);

  async function dismiss(alert: Alert) {
    setDismissingId(alert.id);
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Vehicles that have passed their service due date.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
          <Button variant="link" size="sm" className="ml-2" onClick={load}>
            Retry
          </Button>
        </div>
      ) : alerts === null ? (
        // Skeleton while the first fetch is in flight.
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
          <div className="rounded-full bg-emerald-500/10 p-3">
            <BellOffIcon className="size-8 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-medium">No active alerts</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every vehicle is up to date. We&apos;ll let you know the moment
              anything falls behind.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-red-500/10">
                <BellRingIcon className="size-4 text-red-600" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  <Link
                    href={`/vehicles/${alert.vehicleId}`}
                    className="hover:underline"
                  >
                    {alert.vehicle.registrationNumber}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {alert.vehicle.make} {alert.vehicle.model}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 truncate text-sm text-red-600">
                  <BellRingIcon className="size-3.5 shrink-0" />
                  {overdueLabel(alert.triggeredAt)}
                </p>
              </div>

              {isManager ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={dismissingId === alert.id}
                  onClick={() => dismiss(alert)}
                >
                  <CheckIcon className="size-4" />
                  {dismissingId === alert.id ? "Dismissing…" : "Dismiss"}
                </Button>
              ) : (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <TruckIcon className="size-4 shrink-0" />
                  Awaiting manager
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
