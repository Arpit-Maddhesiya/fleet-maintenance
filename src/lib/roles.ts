import { Role } from "@/generated/prisma/enums";

/**
 * Client-safe role helpers (no Node-only imports, so this module can be used
 * from both server routes and client components).
 */

/** Roles that may manage the fleet (create/edit/archive vehicles and service
 *  records, assign technicians, dismiss alerts). An admin is a fleet manager
 *  plus user management. */
export const MANAGER_ROLES: Role[] = [Role.ADMIN, Role.FLEET_MANAGER];

/** Roles allowed to create users. */
export const USER_ADMIN_ROLES: Role[] = [Role.ADMIN];

export function isManagerRole(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && MANAGER_ROLES.includes(role);
}

export function isAdminRole(role: Role | null | undefined): boolean {
  return role === Role.ADMIN;
}

/** Roles allowed to perform the given action. Admin is always allowed. */
export function allowedRoles(...roles: Role[]): Role[] {
  return Array.from(new Set([Role.ADMIN, ...roles]));
}
