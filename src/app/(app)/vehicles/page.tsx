"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PlusIcon, TruckIcon } from "lucide-react";

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

export default function VehiclesPage() {
  const { data: session } = useSession();
  const isManager = session?.user?.role === Role.FLEET_MANAGER;

  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<Vehicle[]>(
        `/api/vehicles${showArchived ? "?includeArchived=true" : ""}`
      );
      setVehicles(data);
    } catch (error) {
      setVehicles([]);
      // Surface a visible error rather than a blank table.
      setLoadError(error instanceof Error ? error.message : "Failed to load vehicles.");
    }
  }, [showArchived]);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehicles</h1>
          <p className="text-sm text-muted-foreground">
            The fleet, one row per vehicle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
          {isManager ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <PlusIcon className="size-4" />
              Add Vehicle
            </Button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
          <Button variant="link" size="sm" className="ml-2" onClick={load}>
            Retry
          </Button>
        </div>
      ) : vehicles === null ? (
        // Skeleton while the first fetch is in flight.
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-16 text-center">
          <TruckIcon className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {showArchived ? "No archived vehicles" : "No vehicles yet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {showArchived
              ? "Archived vehicles will appear here."
              : isManager
                ? "Add your first vehicle to get started."
                : "The fleet is empty right now."}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registration</TableHead>
                <TableHead>Make / Model</TableHead>
                <TableHead className="text-right">Odometer</TableHead>
                <TableHead className="text-right">Date interval</TableHead>
                <TableHead className="text-right">Mileage interval</TableHead>
                <TableHead>Status</TableHead>
                {isManager ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/vehicles/${vehicle.id}`}
                      className="hover:underline"
                    >
                      {vehicle.registrationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {vehicle.make} {vehicle.model}
                  </TableCell>
                  <TableCell className="text-right">
                    {vehicle.currentOdometer.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {vehicle.dateIntervalDays} days
                  </TableCell>
                  <TableCell className="text-right">
                    {vehicle.mileageInterval.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {vehicle.archivedAt ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge>Active</Badge>
                    )}
                  </TableCell>
                  {isManager ? (
                    <TableCell className="text-right">
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
      )}

      <VehicleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vehicle={editing}
        onSaved={load}
      />
    </div>
  );
}
