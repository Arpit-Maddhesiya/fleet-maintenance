"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DownloadIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * "Export Service History" button for the records list page (Module F5).
 * Calls GET /api/service-records/export with whatever filters are active in
 * the URL right now and triggers a browser download of the returned CSV.
 *
 * A plain fetch + Blob + temporary anchor is used rather than navigating to
 * the URL directly: that way an error response (e.g. session expiry) can be
 * surfaced in a toast instead of silently downloading an error page, and the
 * exported file always keeps the exact filename the API sets.
 */
export function ExportButton() {
  const searchParams = useSearchParams();
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // Pass only the filters the export endpoint honors (same shape as the
      // list query). sortBy/sortDir/page/pageSize are list-view concerns.
      const params = new URLSearchParams();
      for (const key of ["q", "vehicleId", "status", "technicianId"]) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      const query = params.toString();

      const response = await fetch(
        `/api/service-records/export${query ? `?${query}` : ""}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        let message = `Export failed with status ${response.status}.`;
        try {
          const body = await response.json();
          if (body && typeof body.error === "string") message = body.error;
        } catch {
          // Non-JSON error body — keep the status-based message.
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "service-records.csv";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
      toast.success("Service history exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }, [searchParams]);

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <DownloadIcon className="size-4" />
      )}
      {exporting ? "Exporting…" : "Export"}
    </Button>
  );
}
