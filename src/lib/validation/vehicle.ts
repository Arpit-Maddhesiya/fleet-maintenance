import { z } from "zod";

export const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(1, "Registration number is required"),
  make: z.string().trim().min(1, "Make is required"),
  model: z.string().trim().min(1, "Model is required"),
  currentOdometer: z
    .number()
    .int("Must be a whole number")
    .positive("Must be a positive integer"),
  dateIntervalDays: z
    .number()
    .int("Must be a whole number")
    .positive("Must be a positive integer"),
  mileageInterval: z
    .number()
    .int("Must be a whole number")
    .positive("Must be a positive integer"),
});

export const updateVehicleSchema = z.object({
  make: z.string().trim().min(1, "Make is required"),
  model: z.string().trim().min(1, "Model is required"),
  dateIntervalDays: z
    .number()
    .int("Must be a whole number")
    .positive("Must be a positive integer"),
  mileageInterval: z
    .number()
    .int("Must be a whole number")
    .positive("Must be a positive integer"),
});
