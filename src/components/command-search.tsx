"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CarIcon,
  Loader2Icon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api-client";
import {
  OPEN_COMMAND_SEARCH_EVENT,
} from "@/lib/command-search-events";
import type {
  SearchPersonHit,
  SearchResponse,
  SearchServiceRecordHit,
  SearchVehicleHit,
} from "@/lib/types";
import { isManagerRole } from "@/lib/roles";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

interface SearchHit {
  id: string;
  kind: "vehicle" | "service-record" | "technician" | "manager";
  title: string;
  subtitle: string;
  href: string;
  icon: React.ReactNode;
}

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  vehicle: "Vehicles",
  "service-record": "Service records",
  technician: "Technicians",
  manager: "People",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase();
}

/** Ctrl+K toggles the palette (Cmd on macOS); Esc handled by the dialog. */
function isOpenShortcut(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
}

export function CommandSearch() {
  const router = useRouter();
  const { data: session } = useSession();
  const isManager = isManagerRole(session?.user?.role);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Ctrl+K opens (or closes) from anywhere in the app shell.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isOpenShortcut(e)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Also openable via the window event (dashboard header search trigger).
  useEffect(() => {
    const onOpen = () => {
      setQuery("");
      setOpen(true);
    };
    window.addEventListener(OPEN_COMMAND_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_COMMAND_SEARCH_EVENT, onOpen);
  }, []);

  // Debounced fetch — fires once typing pauses.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults(null);
      setLoading(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch<SearchResponse>(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((data) => {
          setResults(data);
          setLoading(false);
          setActiveIndex(-1);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Search failed.");
          setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  // Reset on open, focus the input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults(null);
      setError(null);
      setActiveIndex(-1);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const hits = useMemo<SearchHit[]>(() => {
    if (!results) return [];
    const vehicleHits: SearchHit[] = results.vehicles.map((v) => ({
      id: v.id,
      kind: "vehicle",
      title: v.registrationNumber,
      subtitle: `${v.make} ${v.model} · ${v.currentOdometer.toLocaleString()} km`,
      href: `/vehicles/${v.id}`,
      icon: <CarIcon className="size-4" aria-hidden />,
    }));
    const recordHits: SearchHit[] = results.serviceRecords.map((r) => ({
      id: r.id,
      kind: "service-record",
      title: r.description,
      subtitle: `${r.vehicle.registrationNumber} · ${statusLabel(r.status)}`,
      href: `/service-records/${r.id}`,
      icon: <WrenchIcon className="size-4" aria-hidden />,
    }));
    const technicianHits: SearchHit[] = results.technicians.map((t) => ({
      id: t.id,
      kind: "technician",
      title: t.name,
      subtitle: t.email,
      href: `/service-records?technicianId=${t.id}`,
      icon: <UsersIcon className="size-4" aria-hidden />,
    }));
    const managerHits: SearchHit[] = isManager
      ? results.managers.map((m) => ({
          id: m.id,
          kind: "manager",
          title: m.name,
          subtitle: m.email,
          href: `/service-records?technicianId=${m.id}`,
          icon: <ShieldIcon className="size-4" aria-hidden />,
        }))
      : [];
    return [...vehicleHits, ...recordHits, ...technicianHits, ...managerHits];
  }, [results, isManager]);

  const grouped = useMemo(() => {
    const order: SearchHit["kind"][] = [
      "vehicle",
      "service-record",
      "technician",
      "manager",
    ];
    return order
      .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
      .filter((g) => g.items.length > 0);
  }, [hits]);

  const isEmpty =
    !loading && !error && query.trim().length > 0 && grouped.length === 0;

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  // Keyboard navigation: arrows move within the flattened list, Enter opens.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (hits.length === 0 ? -1 : (i + 1) % hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) =>
        hits.length === 0 ? -1 : (i - 1 + hits.length) % hits.length
      );
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && hits[activeIndex]) {
        e.preventDefault();
        go(hits[activeIndex]);
      }
    }
  }

  // Keep the active item in view while arrowing through a long list.
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-search-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>

        {/* Search input row */}
        <div className="flex items-center gap-2 border-b px-3">
          {loading ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search vehicles, service records, technicians…"
            aria-label="Search"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {error ? (
            <p className="px-2 py-6 text-center text-sm text-destructive">
              {error}
            </p>
          ) : isEmpty ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              No results for “{query.trim()}”.
            </p>
          ) : loading && !results ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : grouped.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              Start typing to search vehicles, service records, and people.
            </p>
          ) : (
            <ul ref={listRef}>
              {grouped.map((group) => (
                <li key={group.kind}>
                  <p className="px-2 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {KIND_LABEL[group.kind]}
                  </p>
                  <ul>
                    {group.items.map((hit) => {
                      const flatIndex = hits.indexOf(hit);
                      return (
                        <li key={`${hit.kind}:${hit.id}`}>
                          <button
                            type="button"
                            data-search-index={flatIndex}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            onClick={() => go(hit)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                              flatIndex === activeIndex
                                ? "bg-accent text-accent-foreground"
                                : "text-foreground"
                            )}
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              {hit.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {hit.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {hit.subtitle}
                              </span>
                            </span>
                            <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-medium">↑</kbd>
            <kbd className="rounded border bg-background px-1 font-medium">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-medium">
              Enter
            </kbd>
            open
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
