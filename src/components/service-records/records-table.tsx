"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ServiceRecordListItem } from "@/lib/types";
import { ServiceStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  TruckIcon,
  WrenchIcon,
} from "lucide-react";

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  DUE: "Due",
  BOOKED: "Booked",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
};

// Display colors match the app-wide status vocabulary (dashboard + nav).
export const STATUS_BADGE_VARIANTS: Record<
  ServiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DUE: "destructive",
  BOOKED: "secondary",
  IN_SERVICE: "default",
  COMPLETED: "outline",
};

/** Icon-chip tint + ring per status, so color never carries meaning alone. */
export const STATUS_CHIP: Record<ServiceStatus, string> = {
  DUE: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  BOOKED: "bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-400",
  IN_SERVICE: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400",
  COMPLETED: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
};

/** First-name initials, e.g. "Alice Manager" → "AM". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
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

interface ServiceRecordsTableProps {
  /** Records to render, or null while the first fetch is in flight. */
  records: ServiceRecordListItem[] | null;
  /** Message shown for an empty list (defaults to the F2 list wording). */
  emptyMessage?: string;
  /** Show the technicians column. Off for endpoints that don't return assignments. */
  showTechnicians?: boolean;
}

/**
 * Shared service-record table used by both the full list (F2) and the
 * technician "My Records" view (F4). Rows navigate to the detail page; the
 * table itself renders a skeleton while `records` is null so parent pages
 * keep their filter controls usable during a refetch.
 *
 * The row/card anatomy mirrors the vehicles list: an icon chip anchors each
 * vehicle, the registration reads as the title, and the description is the
 * subtitle. On small screens the table gives way to one card per record.
 */
export function ServiceRecordsTable({
  records,
  emptyMessage = "No service records match your filters.",
  showTechnicians = true,
}: ServiceRecordsTableProps) {
  const router = useRouter();

  const loading = records === null;
  const colCount = showTechnicians ? 5 : 4;

  function open(record: ServiceRecordListItem) {
    router.push(`/service-records/${record.id}`);
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Vehicle</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Last updated</TableHead>
              {showTechnicians ? <TableHead className="px-4">Technicians</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <TableCell key={j} className={cn(j === 0 && "pl-4")}>
                      <div className="h-4 animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="px-4 py-16">
                  <EmptyState message={emptyMessage} />
                </TableCell>
              </TableRow>
            ) : (
              records.map((record) => (
                <TableRow
                  key={record.id}
                  className="cursor-pointer focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  tabIndex={0}
                  onClick={() => open(record)}
                  onKeyDown={(e) => {
                    // Enter/Space on a focused row opens the record — the row is
                    // focusable precisely so keyboard users can navigate it.
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open(record);
                    }
                  }}
                  aria-label={`Open service record for ${record.vehicle.registrationNumber}`}
                >
                  <TableCell className="px-4">
                    <VehicleTitle record={record} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANTS[record.status]}>
                      {STATUS_LABELS[record.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(record.scheduledDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDateTime(record.updatedAt)}
                  </TableCell>
                  {showTechnicians ? (
                    <TableCell className="px-4">
                      {record.assignments.length === 0 ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <div
                          className="flex items-center"
                          aria-label={`Assigned to ${record.assignments
                            .map((a) => a.technician.name)
                            .join(", ")}`}
                        >
                          <div className="flex -space-x-1.5">
                            {record.assignments.map((assignment) => (
                              <span
                                key={assignment.technician.name}
                                title={assignment.technician.name}
                                className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card"
                              >
                                {initials(assignment.technician.name)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {loading ? (
          <ul className="space-y-3" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="h-36 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
            ))}
          </ul>
        ) : records.length === 0 ? (
          <EmptyState message={emptyMessage} />
        ) : (
          <ul className="space-y-3">
            {records.map((record) => (
              <RecordCard key={record.id} record={record} showTechnicians={showTechnicians} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** The vehicle "identity" block: icon chip + registration + description. */
function VehicleTitle({ record }: { record: ServiceRecordListItem }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
          STATUS_CHIP[record.status]
        )}
      >
        <TruckIcon className="size-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">
          {record.vehicle.registrationNumber}
        </p>
        <p
          className="block max-w-64 truncate text-xs text-muted-foreground"
          title={record.description}
        >
          {record.description}
        </p>
      </div>
    </div>
  );
}

function RecordCard({
  record,
  showTechnicians,
}: {
  record: ServiceRecordListItem;
  showTechnicians: boolean;
}) {
  return (
    <li className="overflow-hidden rounded-2xl border bg-card">
      <Link
        href={`/service-records/${record.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        aria-label={`Open service record for ${record.vehicle.registrationNumber}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
              STATUS_CHIP[record.status]
            )}
          >
            <TruckIcon className="size-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium leading-tight text-foreground">
                {record.vehicle.registrationNumber}
              </p>
              <Badge variant={STATUS_BADGE_VARIANTS[record.status]}>
                {STATUS_LABELS[record.status]}
              </Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {record.description}
            </p>
          </div>
        </div>
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground/60"
          aria-hidden
        />
      </Link>

      <dl className="grid grid-cols-2 gap-px border-t bg-border/60 text-sm">
        <MobileMetric label="Scheduled" value={formatDate(record.scheduledDate)} />
        <MobileMetric label="Last updated" value={formatDateTime(record.updatedAt)} />
        {showTechnicians ? (
          <div className="col-span-2 bg-card px-4 py-2.5">
            <dt className="text-xs text-muted-foreground">Technicians</dt>
            <dd className="mt-1">
              {record.assignments.length === 0 ? (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              ) : (
                <div className="flex -space-x-1.5">
                  {record.assignments.map((assignment) => (
                    <span
                      key={assignment.technician.name}
                      title={assignment.technician.name}
                      className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-card"
                    >
                      {initials(assignment.technician.name)}
                    </span>
                  ))}
                </div>
              )}
            </dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <WrenchIcon className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-medium text-foreground">{message}</p>
    </div>
  );
}
