"use client";

import { useEffect, useRef, useState } from "react";
import { FileUpIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import type { BulkOdometerResponse } from "@/lib/types";

const EXAMPLE_CSV = `registrationNumber,odometerReading
ABC-123,125000
XYZ-789,142500`;

interface BulkOdometerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Re-run the vehicles list after a successful import so the table reflects the new readings. */
  onImported: () => void;
}

/**
 * Manager-only bulk odometer import (Module F5). The dialog stays open after
 * submission: the whole point is showing the per-row report so the manager can
 * see exactly which rows failed and why.
 */
export function BulkOdometerDialog({
  open,
  onOpenChange,
  onImported,
}: BulkOdometerDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<BulkOdometerResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the form whenever the dialog opens fresh — a previous run's report
  // should not linger over the next upload.
  useEffect(() => {
    if (open) {
      setFile(null);
      setReport(null);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiFetch<BulkOdometerResponse>(
        "/api/vehicles/bulk-odometer",
        { method: "POST", formData }
      );
      setReport(result);
      onImported();
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk update odometer</DialogTitle>
          <DialogDescription>
            Upload a CSV of registrations and new readings. Rows are applied
            individually — rows with an unknown registration or a reading lower
            than the current one are rejected and reported below.
          </DialogDescription>
        </DialogHeader>

        {report === null ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="csv-file">CSV file</Label>
              <Input
                ref={fileInputRef}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Columns: <code>registrationNumber</code>,{" "}
                <code>odometerReading</code> (whole number, must be equal to or
                higher than the current reading).
              </p>
            </div>

            <div className="space-y-2">
              <Label>Expected format</Label>
              <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs leading-5 text-foreground">
                {EXAMPLE_CSV}
              </pre>
            </div>

            <div className="flex justify-end gap-2">
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
                disabled={submitting || !file}
                onClick={() => fileInputRef.current?.focus()}
              >
                {submitting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <FileUpIcon className="size-4" />
                )}
                {submitting ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-medium text-foreground">
                {report.successCount} succeeded
              </span>
              {", "}
              <span className="font-medium text-destructive">
                {report.rejectedCount} rejected
              </span>
            </p>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Registration</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.results.map((result) => (
                    <TableRow key={result.row}>
                      <TableCell className="text-muted-foreground">
                        {result.row}
                      </TableCell>
                      <TableCell className="font-medium">
                        {result.registrationNumber}
                      </TableCell>
                      <TableCell>
                        {result.status === "success" ? (
                          <Badge>Success</Badge>
                        ) : (
                          <Badge variant="destructive">Rejected</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {result.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReport(null);
                  setFile(null);
                  fileInputRef.current?.focus();
                }}
              >
                <RotateCcwIcon className="size-4" />
                Upload another file
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
