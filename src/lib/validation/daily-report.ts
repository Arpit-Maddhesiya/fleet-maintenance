import { z } from "zod";

// Technician daily report: the hands-on summary a technician files after
// 5 PM — jobs finished, hours, which vehicles (registrations), and any issues.
export const technicianDailyReportSchema = z.object({
  jobsCompleted: z
    .number({ message: "Jobs completed is required" })
    .int("Must be a whole number")
    .min(0, "Must not be negative"),
  hoursWorked: z
    .number({ message: "Hours worked is required" })
    .int("Must be a whole number")
    .min(0, "Must not be negative")
    .max(24, "Cannot exceed 24 hours"),
  // One vehicle registration per line; collapsed to lines on the server.
  registrations: z.string().trim().max(1000, "Too long").optional().default(""),
  issues: z.string().trim().max(5000, "Too long").optional().default(""),
});

// Fleet-manager daily report: the coordination summary a manager files after
// 5 PM — services booked/scheduled, vehicles inspected, and a notes box.
export const managerDailyReportSchema = z.object({
  bookingsCount: z
    .number({ message: "Bookings count is required" })
    .int("Must be a whole number")
    .min(0, "Must not be negative"),
  inspectionsCount: z
    .number({ message: "Inspections count is required" })
    .int("Must be a whole number")
    .min(0, "Must not be negative"),
  notes: z.string().trim().max(5000, "Too long").optional().default(""),
});

// Discriminated by role so the route can validate the caller's own form type
// and reject a mismatched payload.
export const submitDailyReportSchema = z.discriminatedUnion("reportType", [
  z.object({
    reportType: z.literal("TECHNICIAN"),
    ...technicianDailyReportSchema.shape,
  }),
  z.object({
    reportType: z.literal("FLEET_MANAGER"),
    ...managerDailyReportSchema.shape,
  }),
]);

export const dailyReportQuerySchema = z.object({
  // "YYYY-MM-DD" (local calendar day in the caller's timezone).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  authorId: z.string().min(1).optional(),
  // Returns the caller's own most recent reports (no date window). Useful for
  // a reporter's "previous days" list.
  history: z.enum(["true", "false"]).optional(),
});
