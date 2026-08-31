import { z } from "zod";

export const createServiceRecordSchema = z.object({
  vehicleId: z.string().min(1, "Vehicle is required"),
  description: z.string().trim().min(1, "Description is required"),
});

export const bookTransitionSchema = z.object({
  action: z.literal("BOOK"),
  scheduledDate: z.string().min(1, "scheduledDate is required"),
  technicianId: z.string().min(1, "At least one technician is required"),
});

export const startTransitionSchema = z.object({
  action: z.literal("START"),
});

export const completeTransitionSchema = z.object({
  action: z.literal("COMPLETE"),
  completedOdometer: z
    .number()
    .int("Must be a whole number")
    .nonnegative("Must not be negative"),
});

export const transitionSchema = z.discriminatedUnion("action", [
  bookTransitionSchema,
  startTransitionSchema,
  completeTransitionSchema,
]);
