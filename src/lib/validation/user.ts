import { z } from "zod";

/**
 * Creating users through the UI is admin-only and deliberately cannot mint
 * new admins — an ADMIN is created by seeding, so the pool of superusers
 * stays under control. FLEET_MANAGER and TECHNICIAN are the assignable roles.
 */
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["FLEET_MANAGER", "TECHNICIAN"]),
});
