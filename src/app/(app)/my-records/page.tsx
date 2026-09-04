"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { FilterIcon, RefreshCwIcon } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { ServiceRecordListItem } from "@/lib/types";
import { ServiceStatus } from "@/generated/prisma/enums";
import { isManagerRole } from "@/lib/roles";
import {
  ServiceRecordsTable,
  STATUS_LABELS,
} from "@/components/service-records/records-table";

/** Sentinels: the select control uses "__all" for "no filter". */
const ALL_STATUSES = "__all";

/**
 * Technician-facing list of "records assigned to me", fetched from the
 * technician-scoped endpoint (GET /api/technicians/[id]/service-records)
 * rather than the general list with a technicianId filter — the backend
 * scopes the result server-side to the caller's own active assignments.
 *
 * A manager can open this page too (it fetches by whatever id is in the URL
 * for the manager, showing that technician's records), but it's primarily
 * for technicians.
 */
export default function MyRecordsPage() {
  const { data: session } = useSession();
  const isManager = isManagerRole(session?.user?.role);

  const [records, setRecords] = useState<ServiceRecordListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  // Bumping this re-runs the fetch — the retry affordance.
  const [retryNonce, setRetryNonce] = useState(0);

  // Filter is applied client-side because the technician-scoped endpoint has
  // no query params — the list itself is already scoped to "assigned to me".
  const filtered =
    records === null
      ? null
      : status === ALL_STATUSES
        ? records
        : records.filter((record) => record.status === status);

  const load = useCallback(async () => {
    // For a technician the backend only serves their own id anyway; for a
    // manager viewing this page, default to their own (curiosity) view.
    const id = session?.user?.id;
    if (!id) return;
    try {
      const data = await apiFetch<ServiceRecordListItem[]>(
        `/api/technicians/${id}/service-records`
      );
      setRecords(data);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load records."
      );
    }
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  const baseTotal = records?.length ?? 0;
  const shownTotal = filtered?.length ?? 0;
  const filtering = status !== ALL_STATUSES;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
            Fleet maintenance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">My records</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isManager
              ? "Records assigned to you — useful as a manager only if you're also a technician."
              : "Every service record you've worked on — current jobs and completed history."}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {records === null
            ? "Loading your records…"
            : filtering
              ? `${shownTotal} of ${baseTotal} record${baseTotal === 1 ? "" : "s"}`
              : `${baseTotal} record${baseTotal === 1 ? "" : "s"} assigned to you over time`}
        </p>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="min-w-40">
            <FilterIcon className="size-3.5 text-muted-foreground" aria-hidden />
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
      ) : (
        <ServiceRecordsTable
          records={filtered}
          emptyMessage={
            filtering
              ? `No records with status "${STATUS_LABELS[status as ServiceStatus] ?? status}".`
              : "No service records yet — once a manager assigns work to you, it will show up here."
          }
          // This endpoint returns vehicle info but not the assignments list,
          // so the technicians column would be meaningless here.
          showTechnicians={false}
        />
      )}
    </div>
  );
}
