import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import type { Role } from "@/generated/prisma/enums";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: String(credentials.email) },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(
          String(credentials.password),
          user.passwordHash
        );
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});

export class UnauthenticatedError extends Error {
  constructor(message = "You must be signed in to perform this action.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  constructor(
    message = "You do not have permission to perform this action.",
    public requiredRole?: Role
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Guards a server action or route handler. Throws UnauthenticatedError when
 * the caller is not signed in, or ForbiddenError when their role does not
 * match.
 */
export async function requireRole(role: Role) {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError();
  }
  if (session.user.role !== role) {
    throw new ForbiddenError(
      `This action requires the ${role} role.`,
      role
    );
  }
  return session;
}
