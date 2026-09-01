import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — Fleet Maintenance",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl = "/dashboard" } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Fleet Maintenance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in with your work account.
          </p>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
