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

/** Active assignment on a detail response — includes the technician's name. */
export interface ServiceAssignmentDetail {
  id: string;
  technicianId: string;
  technician: { id: string; name: string };
}

/** GET /api/service-records/[id] — record + vehicle + active assignments. */
export interface ServiceRecordDetail extends ServiceRecord {
  vehicle: Vehicle;
  assignments: ServiceAssignmentDetail[];
}

/** Body for POST /api/service-records/[id]/assignments. */
export interface CreateAssignmentInput {
  technicianId: string;
}

/** Timeline event from GET /api/service-records/[id]/timeline. */
export interface TimelineEvent {
  id: string;
  type: string;
  createdAt: string;
  actor: { id: string; name: string; role: string };
  technician: { name: string } | null;
  summary: string;
}

/** One row of the report from POST /api/vehicles/bulk-odometer. */
export interface BulkOdometerRowResult {
  /** 1-based CSV row number (header is row 1, so data starts at 2). */
  row: number;
  registrationNumber: string;
  status: "success" | "rejected";
  reason?: string;
}

/** POST /api/vehicles/bulk-odometer — per-row result report. */
export interface BulkOdometerResponse {
  results: BulkOdometerRowResult[];
  successCount: number;
  rejectedCount: number;
}

/** One row from GET /api/alerts — vehicle embedded so the list can render. */
export interface Alert {
  id: string;
  vehicleId: string;
  serviceCycle: number;
  triggeredAt: string;
  dismissedAt: string | null;
  dismissedById: string | null;
  vehicle: Vehicle;
}

/** GET /api/alerts — currently active (non-dismissed, current-cycle) alerts. */
export interface AlertsResponse {
  alerts: Alert[];
  count: number;
}

/** GET /api/dashboard — aggregate stats for the landing page. */
export interface DashboardData {
  dueCount: number;
  inServiceCount: number;
  completedThisWeek: number;
  overdueCount: number;
  byStatus: Record<string, number>;
  byTechnician: Record<string, number>;
  completedPerWeek: { week: string; count: number }[];
}
