"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  GaugeIcon,
  HistoryIcon,
  PencilIcon,
  RepeatIcon,
  RulerIcon,
  TruckIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import { isManagerRole } from "@/lib/roles";
import { Role } from "@/generated/prisma/enums";
import { RoleRestrictedPage } from "@/lib/role-restricted-page";
import { cn } from "@/lib/utils";
import { getVehicleStatus } from "@/lib/vehicle-status";
import type { ServiceRecord, VehicleWithRecords } from "@/lib/types";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";

const statusVariant: Record<
  ServiceRecord["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  DUE: "destructive",
  BOOKED: "secondary",
  IN_SERVICE: "default",
  COMPLETED: "outline",
};

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString();
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

export default function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <RoleRestrictedPage allowedRoles={[Role.FLEET_MANAGER, Role.ADMIN]}>
      <VehicleDetailPageContent params={params} />
    </RoleRestrictedPage>
  );
}

function VehicleDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { data: session } = useSession();
  const isManager = isManagerRole(session?.user?.role);
  const [vehicle, setVehicle] = useState<VehicleWithRecords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    const { id } = await params;
    try {
      const data = await apiFetch<VehicleWithRecords>(`/api/vehicles/${id}`);
      setVehicle(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vehicle.");
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div
          role="alert"
          className="flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300"
        >
          <span className="flex-1">{error}</span>
          <Button
            variant="outline"
            size="sm"
            className="border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300"
            onClick={load}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-stone-200 dark:bg-stone-800" />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const status = getVehicleStatus(vehicle, vehicle.serviceRecords);
  const statusBadge =
    status === "OVERDUE" ? (
      <Badge variant="destructive">Overdue</Badge>
    ) : status === "DUE" ? (
      <Badge variant="outline" className="border-amber-500 text-amber-600">
        Due
      </Badge>
    ) : (
      <Badge variant="secondary">OK</Badge>
    );

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="hidden size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 sm:flex dark:text-amber-400">
            <TruckIcon className="size-6" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight">
                {vehicle.registrationNumber}
              </h1>
              {statusBadge}
              {vehicle.archivedAt ? (
                <Badge variant="secondary">Archived</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {vehicle.make} {vehicle.model}
            </p>
          </div>
        </div>
        {isManager && !vehicle.archivedAt ? (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <PencilIcon className="size-4" aria-hidden />
            Edit
          </Button>
        ) : null}
      </div>

      {/* Vehicle stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<GaugeIcon className="size-4" aria-hidden />}
          iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          label="Current odometer"
          value={`${vehicle.currentOdometer.toLocaleString()} km`}
        />
        <StatCard
          icon={<CalendarDaysIcon className="size-4" aria-hidden />}
          iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          label="Date interval"
          value={`${vehicle.dateIntervalDays} days`}
        />
        <StatCard
          icon={<RulerIcon className="size-4" aria-hidden />}
          iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          label="Mileage interval"
          value={`${vehicle.mileageInterval.toLocaleString()} km`}
        />
        <StatCard
          icon={<RepeatIcon className="size-4" aria-hidden />}
          iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          label="Service cycle"
          value={String(vehicle.serviceCycle)}
        />
      </div>

      {/* Last service summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-500/10 text-stone-600 dark:bg-white/10 dark:text-stone-300">
            <HistoryIcon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last service</p>
            <p className="text-lg font-semibold">
              {vehicle.lastServiceDate
                ? formatDate(vehicle.lastServiceDate)
                : "Never serviced"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-500/10 text-stone-600 dark:bg-white/10 dark:text-stone-300">
            <CheckCircle2Icon className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last service odometer</p>
            <p className="text-lg font-semibold">
              {vehicle.lastServiceOdometer !== null
                ? `${vehicle.lastServiceOdometer.toLocaleString()} km`
                : "Not recorded"}
            </p>
          </div>
        </div>
      </div>

      {/* Service history */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Service history</h2>
            <p className="text-sm text-muted-foreground">
              Every service visit recorded for this vehicle.
            </p>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            {vehicle.serviceRecords.length} record
            {vehicle.serviceRecords.length === 1 ? "" : "s"}
          </span>
        </div>

        {vehicle.serviceRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-stone-500/10 text-stone-500 dark:bg-white/10 dark:text-stone-300">
              <HistoryIcon className="size-6" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                No service records yet
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Once this vehicle has been serviced, its history will appear here.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="px-4">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicle.serviceRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="px-4 font-medium">
                        {record.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[record.status]}>
                          {statusLabel(record.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDate(record.createdAt)}
                      </TableCell>
                      <TableCell className="px-4 tabular-nums">
                        {formatDate(record.completedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {vehicle.serviceRecords.map((record) => (
                <li key={record.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-snug">
                      {record.description}
                    </p>
                    <Badge
                      variant={statusVariant[record.status]}
                      className="shrink-0"
                    >
                      {statusLabel(record.status)}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Created</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">
                        {formatDate(record.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Completed</dt>
                      <dd className="mt-0.5 font-medium tabular-nums">
                        {formatDate(record.completedAt)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <VehicleDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        vehicle={vehicle}
        onSaved={() => load()}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/vehicles"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" aria-hidden />
      Back to vehicles
    </Link>
  );
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          iconClass
        )}
      >
        {icon}
      </span>
      <p className="mt-3 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}
