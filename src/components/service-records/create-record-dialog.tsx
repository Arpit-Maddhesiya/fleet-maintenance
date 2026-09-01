"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, fieldErrorsOf, firstFieldError } from "@/lib/api-client";
import type { CreateServiceRecordInput, Vehicle } from "@/lib/types";

interface CreateRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Vehicles to pick from; passed in so the list page fetches them once. */
  vehicles: Vehicle[];
  onCreated: () => void;
}

export function CreateRecordDialog({
  open,
  onOpenChange,
  vehicles,
  onCreated,
}: CreateRecordDialogProps) {
  const [vehicleId, setVehicleId] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Server-side (Zod) field errors, surfaced inline next to the fields.
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof fieldErrorsOf>>(null);

  // Reset the form whenever the dialog opens fresh.
  useEffect(() => {
    if (open) {
      setVehicleId("");
      setDescription("");
      setFieldErrors(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicleId || description.trim().length === 0) return;

    setSubmitting(true);
    try {
      const body: CreateServiceRecordInput = {
        vehicleId,
        description: description.trim(),
      };
      await apiFetch("/api/service-records", { method: "POST", body });
      toast.success("Service record created");
      onOpenChange(false);
      onCreated();
    } catch (error) {
      // The backend's Zod schema is the source of truth — surface its field
      // messages inline rather than a generic toast.
      const serverErrors = fieldErrorsOf(error);
      if (serverErrors) {
        setFieldErrors(serverErrors);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New service record</DialogTitle>
          <DialogDescription>
            Pick the vehicle and describe the work needed. The record starts as
            DUE; booking it is the next step.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vehicle">Vehicle</Label>
            <Select
              value={vehicleId}
              onValueChange={(v) => {
                setVehicleId(v);
                setFieldErrors((prev) =>
                  prev?.vehicleId ? { ...prev, vehicleId: undefined } : prev
                );
              }}
              required
            >
              <SelectTrigger
                id="vehicle"
                className="w-full"
                aria-invalid={Boolean(firstFieldError(fieldErrors, "vehicleId"))}
              >
                <SelectValue placeholder="Select a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((vehicle) => (
                  <SelectItem key={vehicle.id} value={vehicle.id}>
                    {vehicle.registrationNumber} — {vehicle.make} {vehicle.model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {firstFieldError(fieldErrors, "vehicleId") ? (
              <p className="text-sm text-destructive">
                {firstFieldError(fieldErrors, "vehicleId")}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setFieldErrors((prev) =>
                  prev?.description ? { ...prev, description: undefined } : prev
                );
              }}
              placeholder="Brake pads and discs"
              aria-invalid={Boolean(
                description.trim().length === 0 ||
                  firstFieldError(fieldErrors, "description")
              )}
            />
            {firstFieldError(fieldErrors, "description") ? (
              <p className="text-sm text-destructive">
                {firstFieldError(fieldErrors, "description")}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                What needs to be done — visible to technicians in the list.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || !vehicleId || description.trim().length === 0}
            >
              {submitting ? "Creating…" : "Create record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
