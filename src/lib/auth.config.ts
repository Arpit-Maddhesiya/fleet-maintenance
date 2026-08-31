import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

/**
 * We use the JWT session strategy rather than database sessions.
 * For a project this size that means fewer moving parts — no session table to
 * manage, no extra queries per request. The trade-off: we cannot instantly
 * revoke a session server-side; a session stays valid until the JWT expires.
 *
 * This file must stay free of Node-only imports (Prisma, bcrypt) because it is
 * imported by middleware.ts, which runs on the Edge runtime.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Required in production when the app runs behind a proxy or the host
  // doesn't match the configured AUTH_URL. Prevents the "server
  // configuration" 500 from Auth.js.
  trustHost: true,
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      // user is only present on sign-in; persist role + id into the token
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
