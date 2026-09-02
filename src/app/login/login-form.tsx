"use client";

import { useActionState, useEffect, useState } from "react";
import {
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [errorDismissed, setErrorDismissed] = useState(false);

  // A fresh submit supersedes any dismissed error, so a second failed
  // attempt is never hidden by the previous dismiss.
  useEffect(() => {
    if (pending) setErrorDismissed(false);
  }, [pending]);

  const showError = state?.error && !errorDismissed;

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-stone-900/5 bg-white p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-16px_rgb(0_0_0/0.18)] sm:p-7 dark:border-white/[0.08] dark:bg-[#1b1815] dark:shadow-[0_16px_40px_-16px_rgb(0_0_0/0.6)]"
    >
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      {showError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{state?.error}</span>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-[13px] font-medium">
          Email
        </Label>
        <div className="relative">
          <MailIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="h-11 rounded-xl pl-9"
            required
            onInput={() => setErrorDismissed(true)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-[13px] font-medium">
          Password
        </Label>
        <div className="relative">
          <LockIcon
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-11 rounded-xl pl-9 pr-10"
            onInput={() => setErrorDismissed(true)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {showPassword ? (
              <EyeOffIcon className="size-4" aria-hidden />
            ) : (
              <EyeIcon className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <Button type="submit" className="h-11 w-full rounded-xl text-[15px]" disabled={pending}>
        {pending ? (
          <>
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </Button>
    </form>
  );
}
