"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

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
import { Role, ServiceStatus } from "@/generated/prisma/enums";
import {
  ServiceRecordsTable,
  STATUS_LABELS,
} from "@/components/service-records/records-table";

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
  const isManager = session?.user?.role === Role.FLEET_MANAGER;

  const [records, setRecords] = useState<ServiceRecordListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  // Filter is applied client-side because the technician-scoped endpoint has
  // no query params — the list itself is already scoped to "assigned to me".
  const filtered =
    records === null
      ? null
      : records.filter(
          (record) => status === "" || record.status === status
        );

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
      setLoadError(error instanceof Error ? error.message : "Failed to load records.");
    }
  }, [session?.user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My records</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? "Records assigned to you — useful as a manager only if you're also a technician."
              : "Service records currently assigned to you."}
          </p>
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" className="min-w-32">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
          <Button variant="link" size="sm" className="ml-2" onClick={load}>
            Retry
          </Button>
        </div>
      ) : (
        <ServiceRecordsTable
          records={filtered}
          emptyMessage={
            status === ""
              ? "You have no assigned records right now."
              : "No assigned records match this status."
          }
          // This endpoint returns vehicle info but not the assignments list,
          // so the technicians column would be meaningless here.
          showTechnicians={false}
        />
      )}
    </div>
  );
}
