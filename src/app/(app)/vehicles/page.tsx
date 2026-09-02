"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  ChevronRightIcon,
  FileUpIcon,
  PlusIcon,
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
import type { Vehicle } from "@/lib/types";
import { Role } from "@/generated/prisma/enums";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";
import { ArchiveAction } from "@/components/vehicles/archive-action";
import { BulkOdometerDialog } from "@/components/vehicles/bulk-odometer-dialog";

export default function VehiclesPage() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === Role.FLEET_MANAGER;

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumping this re-runs the fetch effect — the retry affordance.
  const [retryNonce, setRetryNonce] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Vehicle[]>(
        `/api/vehicles${showArchived ? "?includeArchived=true" : ""}`
      );
      setVehicles(data);
      setLoadError(null);
    } catch (error) {
      setVehicles([]);
      // Surface a visible error rather than a blank table.
      setLoadError(
        error instanceof Error ? error.message : "Failed to load vehicles."
      );
    }
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load, retryNonce]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-500">
            Fleet maintenance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The fleet, one vehicle per row.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {vehicles === null
            ? "Loading vehicles…"
            : `${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"}${showArchived ? " including archived" : ""}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
            className="bg-card"
          >
            <ArchiveIcon className="size-4" aria-hidden />
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          {isManager ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBulkDialogOpen(true)}
                className="bg-card"
              >
                <FileUpIcon className="size-4" aria-hidden />
                Bulk Update Odometer
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <PlusIcon className="size-4" aria-hidden />
                Add Vehicle
              </Button>
            </>
          ) : null}
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
      ) : vehicles === null ? (
        <VehicleSkeleton />
      ) : vehicles.length === 0 ? (
        <EmptyVehicles
          showArchived={showArchived}
          isManager={isManager}
          onAdd={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        />
      ) : (
        <>
          {/* Desktop: card-framed table. Mobile: one card per vehicle. */}
          <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">Vehicle</TableHead>
                  <TableHead className="text-right">Odometer</TableHead>
                  <TableHead className="text-right">Date interval</TableHead>
                  <TableHead className="text-right">Mileage interval</TableHead>
                  <TableHead>Status</TableHead>
                  {isManager ? (
                    <TableHead className="px-4 text-right">Actions</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((vehicle) => (
                  <TableRow key={vehicle.id}>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <TruckIcon className="size-4" aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/vehicles/${vehicle.id}`}
                            className="font-medium text-foreground hover:text-amber-600 hover:underline dark:hover:text-amber-400"
                          >
                            {vehicle.registrationNumber}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {vehicle.make} {vehicle.model}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {vehicle.currentOdometer.toLocaleString()} km
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {vehicle.dateIntervalDays} days
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {vehicle.mileageInterval.toLocaleString()} km
                    </TableCell>
                    <TableCell>
                      {vehicle.archivedAt ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : (
                        <Badge>Active</Badge>
                      )}
                    </TableCell>
                    {isManager ? (
                      <TableCell className="px-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(vehicle);
                              setDialogOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <ArchiveAction vehicle={vehicle} onDone={load} />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {vehicles.map((vehicle) => (
              <li
                key={vehicle.id}
                className="overflow-hidden rounded-2xl border bg-card"
              >
                <Link
                  href={`/vehicles/${vehicle.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <TruckIcon className="size-4" aria-hidden />
                    </div>
                    <div>
                      <p className="font-medium leading-tight">
                        {vehicle.registrationNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {vehicle.make} {vehicle.model}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {vehicle.archivedAt ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge>Active</Badge>
                    )}
                    <ChevronRightIcon
                      className="size-4 text-muted-foreground/60"
                      aria-hidden
                    />
                  </div>
                </Link>
                <dl className="grid grid-cols-2 gap-px border-t bg-border/60 text-sm">
                  <MobileMetric
                    label="Odometer"
                    value={`${vehicle.currentOdometer.toLocaleString()} km`}
                  />
                  <MobileMetric
                    label="Date interval"
                    value={`${vehicle.dateIntervalDays} days`}
                  />
                  <MobileMetric
                    label="Mileage interval"
                    value={`${vehicle.mileageInterval.toLocaleString()} km`}
                  />
                  <MobileMetric label="Status" value={vehicle.archivedAt ? "Archived" : "Active"} />
                </dl>
                {isManager ? (
                  <div className="flex items-center justify-end gap-1 border-t px-2 py-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(vehicle);
                        setDialogOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                    <ArchiveAction vehicle={vehicle} onDone={load} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <VehicleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vehicle={editing}
        onSaved={load}
      />

      <BulkOdometerDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onImported={load}
      />
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyVehicles({
  showArchived,
  isManager,
  onAdd,
}: {
  showArchived: boolean;
  isManager: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <TruckIcon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {showArchived ? "No archived vehicles" : "No vehicles yet"}
        </p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {showArchived
            ? "Archived vehicles will appear here when you archive one."
            : isManager
              ? "Add your first vehicle to start tracking its service schedule."
              : "The fleet is empty right now. Check back soon."}
        </p>
      </div>
      {isManager && !showArchived ? (
        <Button size="sm" onClick={onAdd}>
          <PlusIcon className="size-4" aria-hidden />
          Add Vehicle
        </Button>
      ) : null}
    </div>
  );
}

function VehicleSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="hidden h-72 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800 md:block" />
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-36 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800"
          />
        ))}
      </div>
    </div>
  );
}
