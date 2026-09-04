"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

/**
 * Wraps a manager/admin page so a TECHNICIAN visitor is redirected to their
 * dashboard. The app shell only requires a session; specific pages are
 * manager concerns and must not be reachable by technicians even via a direct
 * URL or the command palette. Wrap the page's inner content:
 *
 *   export default function Page() {
 *     return (
 *       <RoleRestrictedPage allowedRoles={["FLEET_MANAGER", "ADMIN"]}>
 *         <PageContent />
 *       </RoleRestrictedPage>
 *     );
 *   }
 *
 * This is deliberately a separate wrapper component (not an early return inside
 * the page) so the child page's hooks always run unconditionally once mounted.
 */
export function RoleRestrictedPage({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    const role = session?.user?.role;
    // Unauthenticated users are already redirected by the app shell layout.
    if (role && !allowedRoles.includes(role)) {
      router.replace("/dashboard");
    }
  }, [status, session?.user?.role, allowedRoles, router]);

  if (status === "loading") {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-6 w-48 animate-pulse rounded-full bg-stone-200 dark:bg-stone-800" />
        <div className="h-40 animate-pulse rounded-2xl bg-stone-200 dark:bg-stone-800" />
      </div>
    );
  }

  const role = session?.user?.role;
  if (!role || !allowedRoles.includes(role)) return null;
  return <>{children}</>;
}
