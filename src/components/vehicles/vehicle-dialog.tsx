"use client";

import { useCallback, useEffect, useState } from "react";
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
import { apiFetch } from "@/lib/api-client";
import type { CreateVehicleInput, UpdateVehicleInput, Vehicle } from "@/lib/types";

/**
 * The client-side validation rules below intentionally mirror the backend's
 * Zod schemas (src/lib/validation/vehicle.ts). They are a UX nicety for
 * instant feedback — the backend re-validates everything and is the real
 * boundary. If you change one, change both.
 */
interface VehicleFormValues {
  registrationNumber: string;
  make: string;
  model: string;
  currentOdometer: string;
  dateIntervalDays: string;
  mileageInterval: string;
}

interface FieldErrors {
  registrationNumber?: string;
  make?: string;
  model?: string;
  currentOdometer?: string;
  dateIntervalDays?: string;
  mileageInterval?: string;
}

const emptyForm: VehicleFormValues = {
  registrationNumber: "",
  make: "",
  model: "",
  currentOdometer: "",
  dateIntervalDays: "",
  mileageInterval: "",
};

function toForm(vehicle: Vehicle): VehicleFormValues {
  return {
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model,
    currentOdometer: String(vehicle.currentOdometer),
    dateIntervalDays: String(vehicle.dateIntervalDays),
    mileageInterval: String(vehicle.mileageInterval),
  };
}

function validate(values: VehicleFormValues, isEdit: boolean): FieldErrors {
  const errors: FieldErrors = {};
  const positiveInt = (v: string) =>
    /^\d+$/.test(v) && Number(v) > 0 ? undefined : "Must be a positive whole number";

  if (values.registrationNumber.trim().length === 0) {
    errors.registrationNumber = "Registration number is required";
  }
  if (values.make.trim().length === 0) errors.make = "Make is required";
  if (values.model.trim().length === 0) errors.model = "Model is required";

  if (!isEdit) {
    const odometer = positiveInt(values.currentOdometer);
    if (odometer) errors.currentOdometer = odometer;
  }

  const dateInterval = positiveInt(values.dateIntervalDays);
  if (dateInterval) errors.dateIntervalDays = dateInterval;

  const mileage = positiveInt(values.mileageInterval);
  if (mileage) errors.mileageInterval = mileage;

  return errors;
}

interface VehicleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this vehicle; otherwise it creates a new one. */
  vehicle?: Vehicle | null;
  onSaved: () => void;
}

export function VehicleDialog({ open, onOpenChange, vehicle, onSaved }: VehicleDialogProps) {
  const isEdit = Boolean(vehicle);
  const [values, setValues] = useState<VehicleFormValues>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog opens (fresh create, or prefilled edit).
  useEffect(() => {
    if (open) {
      setValues(vehicle ? toForm(vehicle) : emptyForm);
      setErrors({});
    }
  }, [open, vehicle]);

  const setField = useCallback((field: keyof VehicleFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nextErrors = validate(values, isEdit);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      if (isEdit && vehicle) {
        const body: UpdateVehicleInput = {
          make: values.make.trim(),
          model: values.model.trim(),
          dateIntervalDays: Number(values.dateIntervalDays),
          mileageInterval: Number(values.mileageInterval),
        };
        await apiFetch(`/api/vehicles/${vehicle.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("Vehicle updated");
      } else {
        const body: CreateVehicleInput = {
          registrationNumber: values.registrationNumber.trim(),
          make: values.make.trim(),
          model: values.model.trim(),
          currentOdometer: Number(values.currentOdometer),
          dateIntervalDays: Number(values.dateIntervalDays),
          mileageInterval: Number(values.mileageInterval),
        };
        await apiFetch("/api/vehicles", { method: "POST", body });
        toast.success("Vehicle created");
      }
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the vehicle's details. The odometer reading is managed through the bulk CSV import, not here."
              : "Register a new vehicle in the fleet."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="registrationNumber">Registration number</Label>
            <Input
              id="registrationNumber"
              value={values.registrationNumber}
              onChange={(e) => setField("registrationNumber", e.target.value)}
              disabled={isEdit}
              placeholder="AB12 CDE"
              aria-invalid={Boolean(errors.registrationNumber)}
            />
            {errors.registrationNumber ? (
              <p className="text-sm text-destructive">{errors.registrationNumber}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="make">Make</Label>
              <Input
                id="make"
                value={values.make}
                onChange={(e) => setField("make", e.target.value)}
                placeholder="Ford"
                aria-invalid={Boolean(errors.make)}
              />
              {errors.make ? (
                <p className="text-sm text-destructive">{errors.make}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={values.model}
                onChange={(e) => setField("model", e.target.value)}
                placeholder="Transit"
                aria-invalid={Boolean(errors.model)}
              />
              {errors.model ? (
                <p className="text-sm text-destructive">{errors.model}</p>
              ) : null}
            </div>
          </div>

          {!isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="currentOdometer">Current odometer</Label>
              <Input
                id="currentOdometer"
                type="number"
                min={1}
                value={values.currentOdometer}
                onChange={(e) => setField("currentOdometer", e.target.value)}
                placeholder="45000"
                aria-invalid={Boolean(errors.currentOdometer)}
              />
              {errors.currentOdometer ? (
                <p className="text-sm text-destructive">{errors.currentOdometer}</p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateIntervalDays">Date interval (days)</Label>
              <Input
                id="dateIntervalDays"
                type="number"
                min={1}
                value={values.dateIntervalDays}
                onChange={(e) => setField("dateIntervalDays", e.target.value)}
                placeholder="180"
                aria-invalid={Boolean(errors.dateIntervalDays)}
              />
              {errors.dateIntervalDays ? (
                <p className="text-sm text-destructive">{errors.dateIntervalDays}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mileageInterval">Mileage interval</Label>
              <Input
                id="mileageInterval"
                type="number"
                min={1}
                value={values.mileageInterval}
                onChange={(e) => setField("mileageInterval", e.target.value)}
                placeholder="15000"
                aria-invalid={Boolean(errors.mileageInterval)}
              />
              {errors.mileageInterval ? (
                <p className="text-sm text-destructive">{errors.mileageInterval}</p>
              ) : null}
            </div>
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
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add vehicle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
