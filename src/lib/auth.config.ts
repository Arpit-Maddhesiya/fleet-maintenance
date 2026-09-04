import type { NextAuthConfig, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

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
    async jwt({ token, user }: { token: JWT; user?: User }) {
      // user is only present on sign-in; persist role + id into the token.
      // The base Auth.js User type leaves id optional, but our Credentials
      // authorize() always sets it, so narrow before writing.
      if (user?.id && user.role) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user && token.id && token.role) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
