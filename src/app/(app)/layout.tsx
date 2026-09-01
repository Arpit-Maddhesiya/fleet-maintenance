import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";
import { Providers } from "@/components/providers";

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
      <div className="flex min-h-screen bg-background">
        <AppNav />
        <main className="flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </Providers>
  );
}
