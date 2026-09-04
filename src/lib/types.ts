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

/** One hit from GET /api/search for a vehicle (registration, make, model). */
export interface SearchVehicleHit {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  currentOdometer: number;
  archivedAt: string | null;
}

/** One hit from GET /api/search for a service record. */
export interface SearchServiceRecordHit {
  id: string;
  description: string;
  status: ServiceStatus;
  vehicle: { registrationNumber: string };
}

/** One hit from GET /api/search for a person (technician or manager). */
export interface SearchPersonHit {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FLEET_MANAGER" | "TECHNICIAN";
}

/** GET /api/search?q= — grouped universal-search response. */
export interface SearchResponse {
  vehicles: SearchVehicleHit[];
  serviceRecords: SearchServiceRecordHit[];
  technicians: SearchPersonHit[];
  managers: SearchPersonHit[];
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

/** One active assignment shown on the technician dashboard. */
export interface TechnicianAssignment {
  id: string;
  status: ServiceStatus;
  description: string;
  scheduledDate: string | null;
  startedAt: string | null;
  dueSince: string;
  vehicle: Pick<Vehicle, "id" | "registrationNumber" | "make" | "model">;
}

/** One completed job shown on the technician dashboard. */
export interface TechnicianCompletedJob {
  id: string;
  description: string;
  completedAt: string;
  completedOdometer: number | null;
  vehicle: Pick<Vehicle, "id" | "registrationNumber" | "make" | "model">;
}

/** GET /api/dashboard — technician-scoped payload when the caller is TECHNICIAN. */
export interface TechnicianDashboardData {
  role: "TECHNICIAN";
  technician: { id: string; name: string };
  /** Active (unassignedAt null) assignments — the technician's open work. */
  assigned: TechnicianAssignment[];
  stats: {
    /** Number of active assignments. */
    assignedCount: number;
    /** Of my assignments: records DUE past the grace period. */
    dueCount: number;
    /** Of my assignments: records currently IN_SERVICE. */
    inServiceCount: number;
    /** Of my completed work: completed in the current UTC week. */
    completedThisWeek: number;
    /** Total service records I have ever completed. */
    completedAllTime: number;
  };
  /** My most recent completed jobs (newest first). */
  recentCompleted: TechnicianCompletedJob[];
}

/** Roles an admin can assign when creating a user (ADMIN excluded — an
 *  admin can only be created by seeding, never through the UI). */
export type CreatableRole = "FLEET_MANAGER" | "TECHNICIAN";

/** Body for POST /api/users (create user). */
export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: CreatableRole;
}

/** GET /api/users — one row of the user-management list. */
export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  /** Count of active service assignments (unassignedAt = null). */
  activeAssignments: number;
}
