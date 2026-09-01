"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircle2Icon,
  PencilIcon,
  PlayIcon,
  UserPlusIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { apiFetch, ApiError, fieldErrorsOf, firstFieldError } from "@/lib/api-client";
import { notifyAlertCountChanged } from "@/lib/alert-events";
import type {
  CreateAssignmentInput,
  ServiceRecordDetail,
  TimelineEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Role, ServiceStatus } from "@/generated/prisma/enums";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  DUE: "Due",
  BOOKED: "Booked",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
};

const STATUS_BADGE_VARIANTS: Record<
  ServiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DUE: "destructive",
  BOOKED: "secondary",
  IN_SERVICE: "default",
  COMPLETED: "outline",
};

interface TechnicianOption {
  id: string;
  name: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ServiceRecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { data: session } = useSession();
  const isManager = session?.user?.role === Role.FLEET_MANAGER;

  const [record, setRecord] = useState<ServiceRecordDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorStatus, setLoadErrorStatus] = useState<number | null>(null);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);

  // The viewer's active assignment — drives which lifecycle buttons show.
  const amIAssigned = useMemo(
    () =>
      session?.user?.id
        ? (record?.assignments ?? []).some(
            (a) => a.technicianId === session.user!.id
          )
        : false,
    [session, record]
  );

  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await apiFetch<ServiceRecordDetail>(`/api/service-records/${id}`);
      setRecord(data);
      setLoadError(null);
      setLoadErrorStatus(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load record.");
      setLoadErrorStatus(
        error instanceof ApiError ? error.status : null
      );
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadTimeline = useCallback(async () => {
    if (!id) return;
    try {
      const events = await apiFetch<TimelineEvent[]>(
        `/api/service-records/${id}/timeline`
      );
      // Newest-first: the most recent activity is what you want without scrolling.
      setTimeline([...events].reverse());
    } catch {
      // Timeline is secondary — the record itself still renders.
    }
  }, [id]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // Technician list for the assignment panel + book dialog.
  useEffect(() => {
    let cancelled = false;
    apiFetch<TechnicianOption[]>("/api/technicians")
      .then((list) => {
        if (!cancelled) setTechnicians(list);
      })
      .catch(() => {
        // Best-effort; the page works without the dropdown populated.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- description editing -------------------------------------------------

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

  const canEditDescription = isManager || amIAssigned;

  function startEditingDescription() {
    if (!record) return;
    setDescriptionDraft(record.description);
    setEditingDescription(true);
  }

  async function saveDescription(e: React.FormEvent) {
    e.preventDefault();
    if (!record || descriptionDraft.trim().length === 0) return;
    setSavingDescription(true);
    try {
      await apiFetch(`/api/service-records/${record.id}`, {
        method: "PATCH",
        body: { description: descriptionDraft.trim() },
      });
      toast.success("Description updated");
      setEditingDescription(false);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update description."
      );
    } finally {
      setSavingDescription(false);
    }
  }

  // --- lifecycle transitions ----------------------------------------------

  const [bookOpen, setBookOpen] = useState(false);
  const [bookDate, setBookDate] = useState("");
  const [bookTechnicianId, setBookTechnicianId] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  // Server-side (Zod) field errors for the book dialog, e.g. an invalid date.
  const [bookFieldErrors, setBookFieldErrors] =
    useState<ReturnType<typeof fieldErrorsOf>>(null);

  const [completeOpen, setCompleteOpen] = useState(false);
  const [completedOdometer, setCompletedOdometer] = useState("");
  const [odometerError, setOdometerError] = useState<string | null>(null);

  // Which lifecycle action applies, given status + viewer role/assignment.
  // Everyone sees the record (assigned technicians reach it via My Records),
  // but action buttons only appear when the backend would accept the call.
  const action =
    record && (isManager || amIAssigned)
      ? record.status === ServiceStatus.DUE && isManager
        ? "BOOK"
        : record.status === ServiceStatus.BOOKED
          ? "START"
          : record.status === ServiceStatus.IN_SERVICE
            ? "COMPLETE"
            : null
      : null;

  async function runTransition(body: Record<string, unknown>) {
    if (!record) return;
    setTransitioning(true);
    try {
      await apiFetch(`/api/service-records/${record.id}/transition`, {
        method: "POST",
        body,
      });
      toast.success(
        body.action === "BOOK"
          ? "Service booked"
          : body.action === "START"
            ? "Service started"
            : "Service completed"
      );
      setBookOpen(false);
      setCompleteOpen(false);
      await Promise.all([load(), loadTimeline()]);
      // A transition can clear or quiet an alert (e.g. completing a service
      // moves the vehicle to the next cycle), so the nav badge count should
      // follow.
      notifyAlertCountChanged();
    } catch (error) {
      // Surface the backend's exact reason (e.g. the 409 state-machine
      // rejection) rather than inventing our own message. If it's a Zod
      // validation failure, the field errors show inline in the dialog.
      const serverErrors = fieldErrorsOf(error);
      if (serverErrors) {
        setBookFieldErrors(serverErrors);
      } else {
        toast.error(
          error instanceof Error ? error.message : "Transition failed."
        );
      }
    } finally {
      setTransitioning(false);
    }
  }

  function submitBook(e: React.FormEvent) {
    e.preventDefault();
    if (!bookDate || !bookTechnicianId) return;
    runTransition({
      action: "BOOK",
      scheduledDate: new Date(bookDate).toISOString(),
      technicianId: bookTechnicianId,
    });
  }

  function startEditingOdometer() {
    setCompletedOdometer(record ? String(record.vehicle.currentOdometer) : "");
    setOdometerError(null);
    setCompleteOpen(true);
  }

  function submitComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!record) return;
    const reading = Number(completedOdometer);
    if (!Number.isInteger(reading) || reading < 0) {
      setOdometerError("Must be a whole number.");
      return;
    }
    // Client-side guard for a nicer UX — the server re-validates and wins.
    if (reading < record.vehicle.currentOdometer) {
      setOdometerError(
        `Reading cannot be lower than the current odometer (${record.vehicle.currentOdometer.toLocaleString()}).`
      );
      return;
    }
    runTransition({ action: "COMPLETE", completedOdometer: reading });
  }

  // --- assignment management ----------------------------------------------

  const [assignTechnicianId, setAssignTechnicianId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const availableTechnicians = technicians.filter(
    (t) => !(record?.assignments ?? []).some((a) => a.technicianId === t.id)
  );

  async function addAssignment() {
    if (!record || !assignTechnicianId) return;
    setAssigning(true);
    try {
      const body: CreateAssignmentInput = { technicianId: assignTechnicianId };
      await apiFetch(`/api/service-records/${record.id}/assignments`, {
        method: "POST",
        body,
      });
      toast.success("Technician assigned");
      setAssignTechnicianId("");
      await Promise.all([load(), loadTimeline()]);
    } catch (error) {
      // 409 (already assigned) and other rejections show the server's reason.
      toast.error(
        error instanceof Error ? error.message : "Failed to assign technician."
      );
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!record) return;
    setRemovingId(assignmentId);
    try {
      await apiFetch(
        `/api/service-records/${record.id}/assignments/${assignmentId}`,
        { method: "DELETE" }
      );
      toast.success("Technician unassigned");
      await Promise.all([load(), loadTimeline()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to unassign technician."
      );
    } finally {
      setRemovingId(null);
    }
  }

  // --- render --------------------------------------------------------------

  if (loadError) {
    // A 403 here means a technician opened a record they aren't assigned to.
    // The list endpoint hides those, but a direct URL can still reach them —
    // show a clear, non-technical explanation instead of a bare error string.
    const isForbidden = loadErrorStatus === 403;
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {isForbidden
            ? "This service record isn't assigned to you, so you can't view it."
            : loadError}
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="space-y-2">
          <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-32 animate-pulse rounded-md bg-muted" />
          <div className="h-40 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {record.vehicle.registrationNumber}
            </h1>
            <Badge variant={STATUS_BADGE_VARIANTS[record.status]}>
              {STATUS_LABELS[record.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.vehicle.make} {record.vehicle.model} · odometer{" "}
            {record.vehicle.currentOdometer.toLocaleString()}
          </p>
        </div>
        {action ? (
          action === "BOOK" ? (
            <Button
              size="sm"
              onClick={() => {
                setBookFieldErrors(null);
                setBookOpen(true);
              }}
            >
              <CalendarIcon className="size-4" />
              Book Service
            </Button>
          ) : action === "START" ? (
            <Button size="sm" onClick={() => runTransition({ action: "START" })}>
              <PlayIcon className="size-4" />
              Start Service
            </Button>
          ) : (
            <Button size="sm" onClick={startEditingOdometer}>
              <CheckCircle2Icon className="size-4" />
              Complete Service
            </Button>
          )
        ) : null}
      </div>

      {/* Description (inline-editable) */}
      <div className="rounded-md border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Description</h2>
          {canEditDescription && !editingDescription ? (
            <Button variant="ghost" size="sm" onClick={startEditingDescription}>
              <PencilIcon className="size-3.5" />
              Edit
            </Button>
          ) : null}
        </div>
        {editingDescription ? (
          <form onSubmit={saveDescription} className="space-y-2">
            <Input
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              aria-invalid={descriptionDraft.trim().length === 0}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingDescription(false)}
                disabled={savingDescription}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingDescription || descriptionDraft.trim().length === 0}
              >
                {savingDescription ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm whitespace-pre-wrap">{record.description}</p>
        )}
      </div>

      {/* Details + assignments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Scheduled date</dt>
              <dd className="font-medium">{formatDate(record.scheduledDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Started</dt>
              <dd className="font-medium">{formatDateTime(record.startedAt ?? "")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Completed</dt>
              <dd className="font-medium">{formatDateTime(record.completedAt ?? "")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Completed odometer</dt>
              <dd className="font-medium">
                {record.completedOdometer?.toLocaleString() ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Due since</dt>
              <dd className="font-medium">{formatDateTime(record.dueSince)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-md border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Assigned technicians
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({record.assignments.length})
            </span>
          </h2>
          {record.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No technicians assigned yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {record.assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <WrenchIcon className="size-4 text-muted-foreground" />
                    {assignment.technician.name}
                  </span>
                  {isManager ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeAssignment(assignment.id)}
                      disabled={removingId === assignment.id}
                      aria-label={`Unassign ${assignment.technician.name}`}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {isManager ? (
            <div className="mt-4 flex items-end gap-2 border-t pt-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="assign-technician">Assign technician</Label>
                <Select
                  value={assignTechnicianId}
                  onValueChange={setAssignTechnicianId}
                >
                  <SelectTrigger id="assign-technician" size="sm" className="w-full">
                    <SelectValue placeholder="Select a technician" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTechnicians.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        All technicians already assigned
                      </div>
                    ) : (
                      availableTechnicians.map((technician) => (
                        <SelectItem key={technician.id} value={technician.id}>
                          {technician.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={addAssignment}
                disabled={assigning || !assignTechnicianId}
              >
                <UserPlusIcon className="size-4" />
                Assign
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Timeline — read-only by design, no edit affordances anywhere near it. */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">History</h2>
        {timeline.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            No history yet.
          </div>
        ) : (
          <div className="rounded-md border bg-card p-4">
            <ol className="space-y-4">
              {timeline.map((event, index) => (
                <li key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                    {index < timeline.length - 1 ? (
                      <span className="w-px flex-1 bg-border" />
                    ) : null}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm">{event.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Book dialog */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Book service</DialogTitle>
            <DialogDescription>
              Pick the scheduled date and the technician who&apos;ll do the work.
              This moves the record from Due to Booked.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitBook} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scheduled-date">Scheduled date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={bookDate}
                onChange={(e) => {
                  setBookDate(e.target.value);
                  setBookFieldErrors((prev) =>
                    prev?.scheduledDate
                      ? { ...prev, scheduledDate: undefined }
                      : prev
                  );
                }}
                aria-invalid={Boolean(
                  firstFieldError(bookFieldErrors, "scheduledDate")
                )}
                required
              />
              {firstFieldError(bookFieldErrors, "scheduledDate") ? (
                <p className="text-sm text-destructive">
                  {firstFieldError(bookFieldErrors, "scheduledDate")}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-technician">Technician</Label>
              <Select
                value={bookTechnicianId}
                onValueChange={(v) => {
                  setBookTechnicianId(v);
                  setBookFieldErrors((prev) =>
                    prev?.technicianId
                      ? { ...prev, technicianId: undefined }
                      : prev
                  );
                }}
              >
                <SelectTrigger
                  id="book-technician"
                  className="w-full"
                  aria-invalid={Boolean(
                    firstFieldError(bookFieldErrors, "technicianId")
                  )}
                >
                  <SelectValue placeholder="Select a technician" />
                </SelectTrigger>
                <SelectContent>
                  {technicians.map((technician) => (
                    <SelectItem key={technician.id} value={technician.id}>
                      {technician.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {firstFieldError(bookFieldErrors, "technicianId") ? (
                <p className="text-sm text-destructive">
                  {firstFieldError(bookFieldErrors, "technicianId")}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBookOpen(false)}
                disabled={transitioning}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={transitioning || !bookDate || !bookTechnicianId}
              >
                {transitioning ? "Booking…" : "Book service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complete service</DialogTitle>
            <DialogDescription>
              Enter the final odometer reading. It must be at least the
              vehicle&apos;s current reading (
              {record.vehicle.currentOdometer.toLocaleString()}).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitComplete} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="completed-odometer">Completed odometer</Label>
              <Input
                id="completed-odometer"
                type="number"
                inputMode="numeric"
                min={0}
                value={completedOdometer}
                onChange={(e) => {
                  setCompletedOdometer(e.target.value);
                  setOdometerError(null);
                }}
                aria-invalid={Boolean(odometerError)}
              />
              {odometerError ? (
                <p className="text-sm text-destructive">{odometerError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCompleteOpen(false)}
                disabled={transitioning}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={transitioning || completedOdometer === ""}
              >
                {transitioning ? "Completing…" : "Complete service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/service-records"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Back to service records
    </Link>
  );
}
