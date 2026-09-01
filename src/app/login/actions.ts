"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

/**
 * Server action backing the login form. Returns an error message instead of
 * redirecting silently so the user actually sees *why* the sign-in failed —
 * "Invalid email or password" for bad credentials, anything else as-is.
 */
export async function loginAction(
  _prevState: LoginState | undefined,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/dashboard");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
    // signIn redirects on success; this line is unreachable in practice.
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      // CredentialsError is the catch-all for bad email/password. The
      // redirect is handled by signIn's throw, so the page just re-renders
      // with the error below.
      return {
        error: "Invalid email or password. Please try again.",
      };
    }
    // Unexpected error — rethrow so Next surfaces it rather than hiding it.
    throw error;
  }
}
