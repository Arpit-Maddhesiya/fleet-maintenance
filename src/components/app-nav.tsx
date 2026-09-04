"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  BellRingIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  TruckIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { ALERT_COUNT_EVENT } from "@/lib/alert-events";
import { isAdminRole, isManagerRole } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AlertsResponse {
  count: number;
}

/** Nav links are role-aware — rendered explicitly in NavContent below. */

export function AppNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isManager = isManagerRole(session?.user?.role);
  const isAdmin = isAdminRole(session?.user?.role);
  const isTechnician = !isManager; // Only three roles; non-manager = technician.

  const refreshAlertCount = useCallback(async () => {
    try {
      const data = await apiFetch<AlertsResponse>("/api/alerts");
      setAlertCount(data.count);
    } catch {
      // The nav badge is a nicety, not critical — leave the count as-is on
      // failure rather than flashing an error.
    }
  }, []);

  // Fetch on mount and refetch whenever the route changes so the badge
  // doesn't go stale mid-session (e.g. after a service-record transition
  // that clears an overdue status). Technicians never see the alerts nav
  // item, so skip the fetch for them.
  useEffect(() => {
    if (isTechnician) return;
    refreshAlertCount();
  }, [pathname, refreshAlertCount, isTechnician]);

  // Also refetch when a page broadcasts that the active alert set changed
  // (a dismiss on the alerts page). Route changes already cover most cases;
  // this catches the ones that happen without navigation.
  useEffect(() => {
    if (isTechnician) return;
    window.addEventListener(ALERT_COUNT_EVENT, refreshAlertCount);
    return () => window.removeEventListener(ALERT_COUNT_EVENT, refreshAlertCount);
  }, [refreshAlertCount, isTechnician]);

  // Close the mobile drawer on navigation so it doesn't linger over content.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (status === "loading") {
    return null;
  }

  const initials =
    session?.user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const user = {
    name: session?.user?.name,
    email: session?.user?.email,
    initials,
  };

  return (
    <>
      {/* Mobile header — a slim branded bar with a hamburger; the drawer
          slides in over the content. Hidden on desktop. */}
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-white/[0.06] bg-[#161311] px-2 text-stone-100 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="flex size-9 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
        >
          <MenuIcon className="size-5" aria-hidden />
        </button>
        <BrandMark />
      </div>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-white/[0.06] bg-[#161311] text-stone-100 shadow-2xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.06] pl-3 pr-2">
              <BrandMark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="flex size-9 items-center justify-center rounded-lg text-stone-300 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              >
                <XIcon className="size-5" aria-hidden />
              </button>
            </div>
            <NavContent
              isManager={isManager}
              isAdmin={isAdmin}
              isTechnician={isTechnician}
              alertCount={alertCount}
              pathname={pathname}
            />
            <UserFooter {...user} />
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar — an always-dark branded rail (matching the login
          brand panel) sitting against the warm app canvas. It is fixed-height
          in the viewport-locked shell; the nav scrolls internally on short
          viewports while the brand and user footer stay pinned. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#161311] lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-white/[0.06] px-3">
          <BrandMark />
        </div>
        <NavContent
          isManager={isManager}
          isAdmin={isAdmin}
          isTechnician={isTechnician}
          alertCount={alertCount}
          pathname={pathname}
        />
        <UserFooter {...user} />
      </aside>
    </>
  );
}

function NavContent({
  isManager,
  isAdmin,
  isTechnician,
  alertCount,
  pathname,
}: {
  isManager: boolean;
  isAdmin: boolean;
  isTechnician: boolean;
  alertCount: number | null;
  pathname: string;
}) {
  return (
    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {/* Everyone has a dashboard. Managers/admins see the fleet pages;
          technicians only see their personal dashboard + records. */}
      <NavLink href="/dashboard" active={pathname.startsWith("/dashboard")}>
        <LayoutDashboardIcon className="size-4" />
        Dashboard
      </NavLink>

      {isManager ? (
        <>
          <NavLink href="/vehicles" active={pathname.startsWith("/vehicles")}>
            <TruckIcon className="size-4" />
            Vehicles
          </NavLink>
          <NavLink
            href="/service-records"
            active={pathname.startsWith("/service-records")}
          >
            <ClipboardListIcon className="size-4" />
            Service Records
          </NavLink>
          <NavLink href="/alerts" active={pathname.startsWith("/alerts")}>
            <BellRingIcon className="size-4" />
            Alerts
            {alertCount !== null && alertCount > 0 ? (
              <Badge className="ml-auto rounded-full border-0 bg-red-600 px-1.5 text-white">
                {alertCount}
              </Badge>
            ) : null}
          </NavLink>
        </>
      ) : null}

      {isTechnician ? (
        <NavLink href="/my-records" active={pathname.startsWith("/my-records")}>
          <UserIcon className="size-4" />
          My Records
        </NavLink>
      ) : null}

      {isAdmin ? (
        <NavLink href="/users" active={pathname.startsWith("/users")}>
          <UsersIcon className="size-4" />
          Users
        </NavLink>
      ) : null}
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-white/[0.08] text-white [&_svg]:text-amber-400"
          : "text-stone-400 hover:bg-white/[0.05] hover:text-stone-100"
      )}
    >
      {children}
    </Link>
  );
}

function UserFooter({
  name,
  email,
  initials,
}: {
  name?: string | null;
  email?: string | null;
  initials: string;
}) {
  return (
    <div className="shrink-0 border-t border-white/[0.06] p-2">
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-300">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-stone-100">
            {name ?? "User"}
          </p>
          <p className="truncate text-xs text-stone-500">{email}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start gap-2 text-stone-400 hover:bg-white/[0.06] hover:text-white focus-visible:ring-white/60"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOutIcon className="size-4" />
        Sign out
      </Button>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-amber-950 shadow-sm shadow-amber-950/30">
        <TruckIcon className="size-4" aria-hidden />
      </div>
      <span className="truncate text-[15px] leading-tight text-stone-100">
        Fleet <span className="font-semibold text-amber-400">Maintenance</span>
      </span>
    </div>
  );
}
