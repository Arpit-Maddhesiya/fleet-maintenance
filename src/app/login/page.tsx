import type { Metadata } from "next";
import {
  BellIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  TruckIcon,
} from "lucide-react";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Fleet Maintenance",
};

// Dot colors mirror the status vocabulary used across the app (dashboard
// status distribution), so the login scene previews the same color
// language a user sees once signed in. Each dot is paired with a label.
const STATUS_LEGEND = [
  { label: "Due", dot: "bg-amber-500" },
  { label: "Booked", dot: "bg-blue-500" },
  { label: "In service", dot: "bg-violet-500" },
  { label: "Completed", dot: "bg-emerald-500" },
];

const SERVICE_POINTS = [
  { icon: CalendarClockIcon, text: "Service schedules that never slip" },
  { icon: ClipboardListIcon, text: "One service record per visit" },
  { icon: BellIcon, text: "Overdue alerts before breakdowns" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl = "/dashboard" } = await searchParams;

  return (
    <main className="relative min-h-dvh bg-[#f6f4ef] text-foreground dark:bg-[#12100e]">
      {/* Ambient washes behind the content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 right-[-10%] size-[28rem] rounded-full bg-amber-400/15 blur-3xl dark:bg-amber-500/10" />
        <div className="absolute bottom-[-15%] left-[35%] size-[24rem] rounded-full bg-stone-500/10 blur-3xl dark:bg-white/[0.04]" />
      </div>

      <div className="relative grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Brand panel — desktop only. The form column carries identity on
            small screens instead. */}
        <aside className="relative hidden flex-col overflow-hidden bg-[#161311] p-10 text-stone-100 lg:flex xl:p-14">
          {/* Dot texture + a warm glow so the panel reads as a surface,
              not a void. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.045) 1px, transparent 0)",
              backgroundSize: "26px 26px",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 top-[-10%] size-[26rem] rounded-full bg-amber-500/15 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/40 to-transparent"
          />

          <header className="relative flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/20">
              <TruckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <p className="text-base font-semibold leading-none text-white">
                Fleet Maintenance
              </p>
              <p className="mt-1.5 text-xs text-stone-400">
                Operations portal
              </p>
            </div>
          </header>

          <div className="relative mt-16 max-w-md xl:mt-24">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-400">
              Fleet maintenance
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
              Keep every vehicle{" "}
              <span className="text-amber-400">on schedule</span>.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-stone-400">
              Scheduling, odometer readings, service records, and alerts for
              your delivery vans and trucks, in one place.
            </p>
            <ul className="mt-9 space-y-3.5">
              {SERVICE_POINTS.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="flex items-center gap-3 text-[15px] text-stone-200"
                >
                  <Icon className="size-[18px] shrink-0 text-amber-400" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-auto max-w-md pt-16">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
                Service status
              </p>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {STATUS_LEGEND.map(({ label, dot }) => (
                  <li
                    key={label}
                    className="flex items-center gap-2.5 text-sm text-stone-200"
                  >
                    <span aria-hidden className={`size-2 rounded-full ${dot}`} />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* Form column */}
        <section className="relative flex items-center justify-center px-4 py-10 sm:px-8 lg:py-16">
          <div className="w-full max-w-md animate-in fade-in-0 duration-500 motion-reduce:animate-none">
            {/* Compact identity header for small screens */}
            <div className="mb-10 flex flex-col items-center text-center lg:hidden">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500 text-amber-950 shadow-lg shadow-amber-500/25">
                <TruckIcon className="size-6" aria-hidden />
              </div>
              <p className="mt-3 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                Fleet Maintenance
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Keep every vehicle on schedule.
              </p>
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100 sm:text-[28px]">
              Welcome back
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
              Sign in to manage vehicles, schedules, and service records.
            </p>

            <div className="mt-8">
              <LoginForm callbackUrl={callbackUrl} />
            </div>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Trouble signing in? Contact your Admin.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
