"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArchiveIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import type { Vehicle } from "@/lib/types";

interface ArchiveActionProps {
  vehicle: Vehicle;
  onDone: () => void;
}

/**
 * Archive/Restore row action with a confirmation dialog before archiving —
 * archiving removes the vehicle from the default fleet view, so a misclick
 * shouldn't do that silently. Restoring is harmless and happens immediately.
 */
export function ArchiveAction({ vehicle, onDone }: ArchiveActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function archive() {
    setBusy(true);
    try {
      await apiFetch(`/api/vehicles/${vehicle.id}/archive`, { method: "POST" });
      toast.success(`${vehicle.registrationNumber} archived`);
      setConfirming(false);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive vehicle.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await apiFetch(`/api/vehicles/${vehicle.id}/restore`, { method: "POST" });
      toast.success(`${vehicle.registrationNumber} restored`);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restore vehicle.");
    } finally {
      setBusy(false);
    }
  }

  if (vehicle.archivedAt) {
    return (
      <Button variant="outline" size="sm" onClick={restore} disabled={busy}>
        <RotateCcwIcon className="size-3.5" />
        Restore
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <ArchiveIcon className="size-3.5" />
        Archive
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {vehicle.registrationNumber}?</DialogTitle>
            <DialogDescription>
              Archiving removes this vehicle from the default fleet view. Its
              service history is kept, and you can restore it any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={archive} disabled={busy}>
              {busy ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
