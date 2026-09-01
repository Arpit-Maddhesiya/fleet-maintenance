"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";

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
import { getVehicleStatus } from "@/lib/vehicle-status";
import type { ServiceRecord, VehicleWithRecords } from "@/lib/types";
import { Role } from "@/generated/prisma/enums";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";

const statusVariant: Record<ServiceRecord["status"], "default" | "secondary" | "destructive" | "outline"> = {
  DUE: "destructive",
  BOOKED: "secondary",
  IN_SERVICE: "default",
  COMPLETED: "outline",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

export default function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const isManager = session?.user?.role === Role.FLEET_MANAGER;
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
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-32 animate-pulse rounded-md bg-muted" />
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

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {vehicle.registrationNumber}
            </h1>
            {statusBadge}
            {vehicle.archivedAt ? <Badge variant="secondary">Archived</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {vehicle.make} {vehicle.model}
          </p>
        </div>
        {isManager && !vehicle.archivedAt ? (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="Current odometer" value={vehicle.currentOdometer.toLocaleString()} />
        <InfoCard label="Date interval" value={`${vehicle.dateIntervalDays} days`} />
        <InfoCard label="Mileage interval" value={vehicle.mileageInterval.toLocaleString()} />
        <InfoCard
          label="Last service"
          value={
            vehicle.lastServiceDate
              ? formatDate(vehicle.lastServiceDate)
              : "Never"
          }
        />
        <InfoCard
          label="Last service odometer"
          value={vehicle.lastServiceOdometer?.toLocaleString() ?? "—"}
        />
        <InfoCard label="Service cycle" value={String(vehicle.serviceCycle)} />
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">Service history</h2>
        {vehicle.serviceRecords.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No service records yet for this vehicle.
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicle.serviceRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.description}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[record.status]}>
                        {statusLabel(record.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(record.createdAt)}</TableCell>
                    <TableCell>{formatDate(record.completedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
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
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Back to vehicles
    </Link>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
