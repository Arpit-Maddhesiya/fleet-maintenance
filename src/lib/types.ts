/**
 * Client-side types for the API responses. These mirror the shapes the
 * backend returns from its route handlers (Prisma models serialized as JSON).
 */

export type ServiceStatus = "DUE" | "BOOKED" | "IN_SERVICE" | "COMPLETED";

export interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  currentOdometer: number;
  dateIntervalDays: number;
  mileageInterval: number;
  lastServiceDate: string | null;
  lastServiceOdometer: number | null;
  serviceCycle: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  description: string;
  status: ServiceStatus;
  scheduledDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completedOdometer: number | null;
  dueSince: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/vehicles/[id] — vehicle with its service history (most recent first). */
export interface VehicleWithRecords extends Vehicle {
  serviceRecords: ServiceRecord[];
}

/** Body for POST /api/vehicles (create). */
export interface CreateVehicleInput {
  registrationNumber: string;
  make: string;
  model: string;
  currentOdometer: number;
  dateIntervalDays: number;
  mileageInterval: number;
}

/** Body for PATCH /api/vehicles/[id] (edit). */
export interface UpdateVehicleInput {
  make: string;
  model: string;
  dateIntervalDays: number;
  mileageInterval: number;
}

/**
 * A service record as returned by GET /api/service-records — the list
 * endpoint includes the vehicle registration and currently assigned
 * technicians so the table can render without follow-up requests.
 */
export interface ServiceRecordListItem extends ServiceRecord {
  vehicle: { registrationNumber: string };
  assignments: { technician: { name: string } }[];
}

/** GET /api/service-records — paginated list response. */
export interface ServiceRecordListResponse {
  data: ServiceRecordListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Body for POST /api/service-records (create). */
export interface CreateServiceRecordInput {
  vehicleId: string;
  description: string;
}
