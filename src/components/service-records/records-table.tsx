"use client";

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

export const STATUS_LABELS: Record<ServiceStatus, string> = {
  DUE: "Due",
  BOOKED: "Booked",
  IN_SERVICE: "In service",
  COMPLETED: "Completed",
};

export const STATUS_BADGE_VARIANTS: Record<
  ServiceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DUE: "destructive",
  BOOKED: "secondary",
  IN_SERVICE: "default",
  COMPLETED: "outline",
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
 */
export function ServiceRecordsTable({
  records,
  emptyMessage = "No service records match your filters.",
  showTechnicians = true,
}: ServiceRecordsTableProps) {
  const router = useRouter();

  const loading = records === null;
  const colCount = showTechnicians ? 6 : 5;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vehicle</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Scheduled</TableHead>
            <TableHead>Last updated</TableHead>
            {showTechnicians ? <TableHead>Technicians</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: colCount }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : records.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="py-16 text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            records.map((record) => (
              <TableRow
                key={record.id}
                className="cursor-pointer focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                tabIndex={0}
                onClick={() => router.push(`/service-records/${record.id}`)}
                onKeyDown={(e) => {
                  // Enter/Space on a focused row opens the record — the row is
                  // focusable precisely so keyboard users can navigate it.
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/service-records/${record.id}`);
                  }
                }}
                aria-label={`Open service record for ${record.vehicle.registrationNumber}`}
              >
                <TableCell className="font-medium">
                  {record.vehicle.registrationNumber}
                </TableCell>
                <TableCell>
                  <span
                    title={record.description}
                    className="block max-w-72 truncate"
                  >
                    {record.description}
                  </span>
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
                  <TableCell>
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
                              className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background"
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
  );
}
