import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { Providers } from "@/components/providers";
import { CommandSearch } from "@/components/command-search";

/**
 * Authenticated app shell. Every route under /(app) gets the sidebar nav
 * and the session provider. This layout does NOT enforce roles — it only
 * requires an authenticated session and redirects logged-out visitors to
 * the login page. Role-specific authorization happens server-side in the
 * API routes (requireRole); the UI merely hides manager-only controls,
 * which is cosmetic and documented as such.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/dashboard")}`);
  }

  return (
    <Providers>
      {/* Viewport-locked app frame: the page itself never scrolls. The nav
          (sidebar on desktop, top bar on mobile) is a fixed-height rail and
          <main> is the only element that scrolls, so tall pages scroll under
          a stationary navbar instead of carrying it off-screen. The warm
          backdrop matches the login page's surface language. */}
      <div className="flex h-dvh flex-col bg-[#f6f4ef] lg:flex-row lg:overflow-hidden dark:bg-[#12100e]">
        <AppNav />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
        <CommandSearch />
      </div>
    </Providers>
  );
}
