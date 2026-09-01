"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  BellIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  TruckIcon,
  UserIcon,
} from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { Role } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AlertsResponse {
  count: number;
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/vehicles", label: "Vehicles", icon: TruckIcon },
  { href: "/service-records", label: "Service Records", icon: ClipboardListIcon },
];

export function AppNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState<number | null>(null);

  const isManager = session?.user?.role === Role.FLEET_MANAGER;

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
  // that clears an overdue status).
  useEffect(() => {
    refreshAlertCount();
  }, [pathname, refreshAlertCount]);

  if (status === "loading") {
    return null;
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <TruckIcon className="size-5" />
        <span className="font-semibold">Fleet Maintenance</span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <NavLink key={href} href={href} active={pathname.startsWith(href)}>
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}

        {/* My Records is technician-facing: a manager's records are visible in
            the general Service Records list, so this link is cosmetic-only for
            the technician role. The backend is the real boundary. */}
        {isManager ? null : (
          <NavLink
            href="/my-records"
            active={pathname.startsWith("/my-records")}
          >
            <UserIcon className="size-4" />
            My Records
          </NavLink>
        )}

        <NavLink href="/alerts" active={pathname.startsWith("/alerts")}>
          <BellIcon className="size-4" />
          Alerts
          {alertCount !== null && alertCount > 0 ? (
            <Badge
              variant={alertCount > 0 ? "destructive" : "secondary"}
              className="ml-auto"
            >
              {alertCount}
            </Badge>
          ) : null}
        </NavLink>
      </nav>

      <div className="border-t p-2">
        <div className="px-2 py-1.5 text-sm">
          <p className="truncate font-medium">{session?.user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {session?.user?.email}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </Button>
      </div>
    </aside>
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
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
      )}
    >
      {children}
    </Link>
  );
}
