"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2Icon, Loader2Icon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, fieldErrorsOf, firstFieldError } from "@/lib/api-client";
import { notifyReportSubmitted } from "@/lib/report-events";
import type { DailyReportDto, DailyReportResponse } from "@/lib/types";

interface ManagerReportFormProps {
  /** The manager's existing report for today, if already filed. */
  existing?: DailyReportDto | null;
  onSaved: (report: DailyReportDto) => void;
}

const numericOnly = (value: string) => value.replace(/\D/g, "");

export function ManagerReportForm({ existing, onSaved }: ManagerReportFormProps) {
  const [bookingsCount, setBookingsCount] = useState(
    existing ? String(existing.bookingsCount) : ""
  );
  const [inspectionsCount, setInspectionsCount] = useState(
    existing ? String(existing.inspectionsCount) : ""
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof fieldErrorsOf>>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFieldErrors(null);
    try {
      const data = await apiFetch<DailyReportResponse>("/api/daily-reports", {
        method: "POST",
        body: {
          reportType: "FLEET_MANAGER",
          bookingsCount: bookingsCount === "" ? 0 : Number(bookingsCount),
          inspectionsCount: inspectionsCount === "" ? 0 : Number(inspectionsCount),
          notes,
        },
      });
      notifyReportSubmitted();
      toast.success(existing ? "Daily report updated" : "Daily report submitted");
      if (data.report) onSaved(data.report);
    } catch (error) {
      const serverErrors = fieldErrorsOf(error);
      if (serverErrors) {
        setFieldErrors(serverErrors);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Could not submit your report."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bookings-count">Services booked / scheduled</Label>
          <Input
            id="bookings-count"
            type="text"
            inputMode="numeric"
            value={bookingsCount}
            onChange={(e) => {
              setBookingsCount(numericOnly(e.target.value));
              setFieldErrors((prev) =>
                prev?.bookingsCount ? { ...prev, bookingsCount: undefined } : prev
              );
            }}
            placeholder="0"
            aria-invalid={Boolean(firstFieldError(fieldErrors, "bookingsCount"))}
          />
          {firstFieldError(fieldErrors, "bookingsCount") ? (
            <p className="text-sm text-destructive">
              {firstFieldError(fieldErrors, "bookingsCount")}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="inspections-count">Vehicles inspected / checked</Label>
          <Input
            id="inspections-count"
            type="text"
            inputMode="numeric"
            value={inspectionsCount}
            onChange={(e) => {
              setInspectionsCount(numericOnly(e.target.value));
              setFieldErrors((prev) =>
                prev?.inspectionsCount
                  ? { ...prev, inspectionsCount: undefined }
                  : prev
              );
            }}
            placeholder="0"
            aria-invalid={Boolean(firstFieldError(fieldErrors, "inspectionsCount"))}
          />
          {firstFieldError(fieldErrors, "inspectionsCount") ? (
            <p className="text-sm text-destructive">
              {firstFieldError(fieldErrors, "inspectionsCount")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="manager-notes">Notes — the day&apos;s summary</Label>
        <Textarea
          id="manager-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What happened today — scheduling, coordination, issues to escalate…"
          className="min-h-28"
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? (
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
        ) : existing ? (
          <CheckCircle2Icon className="size-4" aria-hidden />
        ) : null}
        {submitting
          ? "Submitting…"
          : existing
            ? "Update today's report"
            : "Submit today's report"}
      </Button>
      <p className="text-xs text-muted-foreground">
        You can edit today&apos;s report until midnight.
      </p>
    </form>
  );
}

/** The "not yet 5 PM" locked state — shared with the technician dashboard. */
export function ManagerReportLockedState({ openTime }: { openTime: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
      <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">Daily reports open at 5 PM</p>
        <p className="mt-0.5 text-amber-700/90 dark:text-amber-200/80">
          Your report for today unlocks at {openTime}. Come back after work to
          file it.
        </p>
      </div>
    </div>
  );
}
