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
    public requiredRole?: Role | Role[]
  ) {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Role helpers live in the client-safe module src/lib/roles.ts (shared with
// client components); re-export so server routes can keep importing them from
// here.
import {
  MANAGER_ROLES,
  USER_ADMIN_ROLES,
  isAdminRole,
  isManagerRole,
  allowedRoles,
} from "@/lib/roles";
export {
  MANAGER_ROLES,
  USER_ADMIN_ROLES,
  isAdminRole,
  isManagerRole,
  allowedRoles,
};

/**
 * Guards a server action or route handler. Throws UnauthenticatedError when
 * the caller is not signed in, or ForbiddenError when their role does not
 * match. Pass the privileged roles (e.g. requireRole(Role.FLEET_MANAGER));
 * an ADMIN is always allowed.
 */
export async function requireRole(...roles: Role[]) {
  const session = await auth();
  if (!session?.user) {
    throw new UnauthenticatedError();
  }
  if (!allowedRoles(...roles).includes(session.user.role)) {
    throw new ForbiddenError(
      `This action requires one of the following roles: ${allowedRoles(...roles).join(", ")}.`,
      allowedRoles(...roles)
    );
  }
  return session;
}
