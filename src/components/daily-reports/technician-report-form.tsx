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
import type { DailyReportResponse } from "@/lib/types";
import type { DailyReportDto } from "@/lib/types";

interface TechnicianReportFormProps {
  /** The technician's existing report for today, if already filed. */
  existing?: DailyReportDto | null;
  /** Callback after a successful save, with the fresh report. */
  onSaved: (report: DailyReportDto) => void;
}

/** Numeric fields, all integers. */
const numericOnly = (value: string) => value.replace(/\D/g, "");

export function TechnicianReportForm({ existing, onSaved }: TechnicianReportFormProps) {
  const [jobsCompleted, setJobsCompleted] = useState(
    existing ? String(existing.jobsCompleted) : ""
  );
  const [hoursWorked, setHoursWorked] = useState(
    existing ? String(existing.hoursWorked) : ""
  );
  const [registrations, setRegistrations] = useState(existing?.registrations ?? "");
  const [issues, setIssues] = useState(existing?.notes ?? "");
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
          reportType: "TECHNICIAN",
          jobsCompleted: jobsCompleted === "" ? 0 : Number(jobsCompleted),
          hoursWorked: hoursWorked === "" ? 0 : Number(hoursWorked),
          registrations,
          issues,
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
          <Label htmlFor="jobs-completed">Jobs completed</Label>
          <Input
            id="jobs-completed"
            type="text"
            inputMode="numeric"
            value={jobsCompleted}
            onChange={(e) => {
              setJobsCompleted(numericOnly(e.target.value));
              setFieldErrors((prev) =>
                prev?.jobsCompleted ? { ...prev, jobsCompleted: undefined } : prev
              );
            }}
            placeholder="0"
            aria-invalid={Boolean(firstFieldError(fieldErrors, "jobsCompleted"))}
          />
          {firstFieldError(fieldErrors, "jobsCompleted") ? (
            <p className="text-sm text-destructive">
              {firstFieldError(fieldErrors, "jobsCompleted")}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="hours-worked">Hours worked</Label>
          <Input
            id="hours-worked"
            type="text"
            inputMode="numeric"
            value={hoursWorked}
            onChange={(e) => {
              setHoursWorked(numericOnly(e.target.value));
              setFieldErrors((prev) =>
                prev?.hoursWorked ? { ...prev, hoursWorked: undefined } : prev
              );
            }}
            placeholder="8"
            aria-invalid={Boolean(firstFieldError(fieldErrors, "hoursWorked"))}
          />
          {firstFieldError(fieldErrors, "hoursWorked") ? (
            <p className="text-sm text-destructive">
              {firstFieldError(fieldErrors, "hoursWorked")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="registrations">Vehicles worked on</Label>
        <Textarea
          id="registrations"
          value={registrations}
          onChange={(e) => setRegistrations(e.target.value)}
          placeholder={"KA-01-AB-1234\nKA-02-CD-5678"}
          className="min-h-20"
          aria-invalid={Boolean(firstFieldError(fieldErrors, "registrations"))}
        />
        <p className="text-xs text-muted-foreground">
          One vehicle registration per line.
        </p>
        {firstFieldError(fieldErrors, "registrations") ? (
          <p className="text-sm text-destructive">
            {firstFieldError(fieldErrors, "registrations")}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="issues">Issues / notes</Label>
        <Textarea
          id="issues"
          value={issues}
          onChange={(e) => setIssues(e.target.value)}
          placeholder="Anything worth flagging — parts needed, follow-ups, safety notes…"
          className="min-h-24"
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

/** The "not yet 5 PM" locked state — shown in place of the form. */
export function ReportLockedState({ openTime }: { openTime: string }) {
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
