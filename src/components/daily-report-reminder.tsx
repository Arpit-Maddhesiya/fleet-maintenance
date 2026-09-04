"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { CalendarClockIcon, XIcon } from "lucide-react";

import { apiFetch } from "@/lib/api-client";
import { isBeforeLocalTime, localDayKey } from "@/lib/local-day";
import { REPORT_SUBMITTED_EVENT } from "@/lib/report-events";
import { Role } from "@/generated/prisma/enums";
import type { DailyReportResponse } from "@/lib/types";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * App-wide "don't forget your daily report" banner. Appears for technicians
 * and fleet managers once it is at/after 5 PM in the browser's local time and
 * they have not yet filed today's report. Re-checks every minute (so it turns
 * on at 5:00 sharp) and whenever the route changes; hides itself once the
 * report is filed (a REPORT_SUBMITTED event or a refetch sees it).
 *
 * Purely a nudge — the server enforces the real 5 PM rule on POST.
 */
export function DailyReportReminder() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [now, setNow] = useState(() => new Date());
  const [filed, setFiled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const role = session?.user?.role;

  // Tick every minute so the banner flips on exactly at 17:00 local.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const isReporter = role === Role.TECHNICIAN || role === Role.FLEET_MANAGER;
  const open = !isBeforeLocalTime(now, 17, 0, timeZone);

  const checkFiled = useCallback(async () => {
    try {
      const todayKey = localDayKey(new Date(), timeZone);
      const data = await apiFetch<DailyReportResponse>(
        `/api/daily-reports?date=${todayKey}`,
        { headers: { "X-Timezone": timeZone } }
      );
      setFiled(data.report !== null);
    } catch {
      // Keep whatever we last knew on failure — the banner is a nicety.
    }
  }, []);

  // Check when the page mounts, whenever the route changes, and once the
  // minute rolls past 5 PM (only if we haven't confirmed filed yet).
  useEffect(() => {
    if (!isReporter || status !== "authenticated") return;
    checkFiled();
  }, [checkFiled, pathname, isReporter, status, open]);

  // A successful submit anywhere dismisses the banner immediately.
  useEffect(() => {
    if (!isReporter) return;
    const onSubmitted = () => {
      setFiled(true);
      setDismissed(false);
    };
    window.addEventListener(REPORT_SUBMITTED_EVENT, onSubmitted);
    return () => window.removeEventListener(REPORT_SUBMITTED_EVENT, onSubmitted);
  }, [isReporter]);

  // Hide for admins, sessions still loading, when it's before 5 PM, or when
  // today's report is already filed/dismissed.
  if (!isReporter || status !== "authenticated") return null;
  if (!open || filed === true || dismissed) return null;

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <Link
          href="/daily-reports"
          className="group flex min-w-0 items-center gap-2.5 text-sm text-amber-900 dark:text-amber-200"
        >
          <CalendarClockIcon
            className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <span className="truncate">
            It&apos;s after 5 PM — don&apos;t forget to file your daily report.
          </span>
          <span className="shrink-0 font-medium text-amber-700 underline-offset-4 group-hover:underline dark:text-amber-300">
            File it now
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss reminder"
          className="shrink-0 rounded-md p-1 text-amber-700/70 transition-colors hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
