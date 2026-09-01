"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  WrenchIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api-client";
import type {
  ServiceRecordListItem,
  ServiceRecordListResponse,
  Vehicle,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Role, ServiceStatus } from "@/generated/prisma/enums";
import { CreateRecordDialog } from "@/components/service-records/create-record-dialog";

const PAGE_SIZE = 20;

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

const SORT_FIELDS = [
  { value: "updatedAt", label: "Last updated" },
  { value: "scheduledDate", label: "Scheduled date" },
  { value: "status", label: "Status" },
] as const;

type SortBy = (typeof SORT_FIELDS)[number]["value"];
type SortDir = "asc" | "desc";

interface TechnicianOption {
  id: string;
  name: string;
}

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

export default function ServiceRecordsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isManager = session?.user?.role === Role.FLEET_MANAGER;

  const [records, setRecords] = useState<ServiceRecordListItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  // The search input is uncontrolled so typing stays snappy; its value is
  // pushed into the URL (debounced) and only then refetched.
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");

  const q = searchParams.get("q") ?? "";
  const vehicleId = searchParams.get("vehicleId") ?? "";
  const status = searchParams.get("status") ?? "";
  const technicianId = searchParams.get("technicianId") ?? "";
  const sortBy = (searchParams.get("sortBy") as SortBy) || "updatedAt";
  const sortDir: SortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);
  const loading = records === null;

  const isCurrent = useCallback(
    (name: string, value: string) =>
      (searchParams.get(name) ?? "") === value,
    [searchParams]
  );

  // Every control rewrites the URL query params and lets the effect below
  // refetch — the URL is the single source of truth for the view (and the
  // filtered URL is shareable/bookmarkable as a result).
  const pushParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      // Changing filters resets to page 1 unless the patch is explicitly
      // changing the page.
      if (!("page" in patch)) next.delete("page");
      router.push(`/service-records?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Debounced text search — the request only fires once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== q) pushParams({ q: searchInput.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, q, pushParams]);

  // Fetch the current page whenever the URL query params change.
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set("pageSize", String(PAGE_SIZE));
    if (sortBy) params.set("sortBy", sortBy);
    if (sortDir) params.set("sortDir", sortDir);

    const controller = new AbortController();
    apiFetch<ServiceRecordListResponse>(`/api/service-records?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setRecords(data.data);
        setTotal(data.total);
        setLoadError(null);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(error instanceof Error ? error.message : "Failed to load records.");
      });
    return () => controller.abort();
  }, [searchParams, q, vehicleId, status, technicianId, sortBy, sortDir, page]);

  // Static filter options, fetched once: every vehicle, and every technician
  // (the technician dropdown is manager-only — a technician's view is scoped
  // server-side, so the control would be meaningless to them).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch<Vehicle[]>("/api/vehicles"),
      apiFetch<TechnicianOption[]>("/api/technicians"),
    ])
      .then(([vehicleList, technicianList]) => {
        if (cancelled) return;
        setVehicles(vehicleList);
        setTechnicians(technicianList);
      })
      .catch(() => {
        // Filter dropdowns are best-effort; the table still loads without them.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSortDir = () =>
    pushParams({ sortDir: sortDir === "asc" ? "desc" : "asc" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Service records</h1>
          <p className="text-sm text-muted-foreground">
            Every service across the fleet, searchable and filterable.
          </p>
        </div>
        {isManager ? (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <PlusIcon className="size-4" />
            New Record
          </Button>
        ) : null}
      </div>

      {/* Controls — always usable, even while a new page of results loads. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search description…"
            className="h-9 w-64 rounded-md border border-input bg-transparent pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>

        <Select
          value={vehicleId}
          onValueChange={(v) => pushParams({ vehicleId: v })}
        >
          <SelectTrigger size="sm" className="min-w-36">
            <SelectValue placeholder="All vehicles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All vehicles</SelectItem>
            {vehicles.map((vehicle) => (
              <SelectItem key={vehicle.id} value={vehicle.id}>
                {vehicle.registrationNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => pushParams({ status: v })}>
          <SelectTrigger size="sm" className="min-w-32">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map((value) => (
              <SelectItem key={value} value={value}>
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isManager ? (
          <Select
            value={technicianId}
            onValueChange={(v) => pushParams({ technicianId: v })}
          >
            <SelectTrigger size="sm" className="min-w-36">
              <SelectValue placeholder="All technicians" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All technicians</SelectItem>
              {technicians.map((technician) => (
                <SelectItem key={technician.id} value={technician.id}>
                  {technician.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select value={sortBy} onValueChange={(v) => pushParams({ sortBy: v })}>
          <SelectTrigger size="sm" className="min-w-36">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_FIELDS.map((field) => (
              <SelectItem key={field.value} value={field.value}>
                {field.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleSortDir}
          aria-label={`Sort ${sortDir === "asc" ? "ascending" : "descending"}`}
        >
          {sortDir === "asc" ? (
            <ArrowUpIcon className="size-4" />
          ) : (
            <ArrowDownIcon className="size-4" />
          )}
        </Button>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Technicians</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-16 text-center text-muted-foreground"
                  >
                    No service records match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow
                    key={record.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/service-records/${record.id}`)
                    }
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
                    <TableCell>
                      <div className="flex items-center">
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
                        {record.assignments.length === 0 ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination — hidden while the very first page is still loading, so the
          "X–Y of Z" doesn't flash "0–0 of 0". */}
      {!loading ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {rangeStart}–{rangeEnd} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => pushParams({ page: String(page - 1) })}
            >
              <ChevronLeftIcon className="size-4" />
              Prev
            </Button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Button
                key={n}
                variant={n === page ? "default" : "outline"}
                size="sm"
                className={cn(n === page && "pointer-events-none")}
                onClick={() => pushParams({ page: String(n) })}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => pushParams({ page: String(page + 1) })}
            >
              Next
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <CreateRecordDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vehicles={vehicles}
        onCreated={() => pushParams({ page: "1" })}
      />
    </div>
  );
}
