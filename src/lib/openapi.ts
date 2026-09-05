/**
 * Central OpenAPI 3.0 specification for the Fleet Maintenance API.
 *
 * Every route handler in src/app/api is documented here by hand so the spec
 * stays a deliberate, readable artifact rather than generated noise. The spec
 * is served as JSON by GET /api/docs and rendered by the Swagger UI page at
 * /api-docs (src/app/api-docs).
 *
 * Conventions reflected in the paths:
 *  - Auth: every endpoint requires a session cookie (Auth.js Credentials
 *    provider, JWT strategy). There is no bearer-token flow — Swagger UI
 *    "Try it out" works because the docs page is same-origin and the browser
 *    sends the session cookie automatically.
 *  - Roles: ADMIN is always allowed anywhere a FLEET_MANAGER is (see
 *    src/lib/roles.ts). requireRole() is the enforcement point.
 *  - Errors: handlers throw typed errors mapped once in src/lib/api.ts:
 *    401 unauthenticated, 403 wrong role / not assigned, 400 Zod validation,
 *    404 not found, 409 illegal lifecycle move / duplicate / active reference.
 *  - Date bucketing ("this week", the 8-week chart, daily-report day) follows
 *    the caller's IANA timezone, sent as the X-Timezone header and validated
 *    with a UTC fallback (src/lib/local-week.ts / local-day.ts).
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Fleet Maintenance API",
    description:
      "The REST API behind the Fleet Maintenance app: role-based accounts, vehicles, a Due → Booked → In Service → Completed service lifecycle, technician assignments with history, server-side search/filter/sort/pagination, bulk CSV odometer import, CSV export, dashboard aggregates, an append-only audit timeline, overdue alerts, and role-based daily work reports.\n\nAll endpoints require an authenticated session cookie. Fleet-manager actions accept an ADMIN as well; role checks are enforced server-side in every handler.",
    version: "1.0.0",
    contact: {
      name: "Fleet Maintenance",
    },
  },
  servers: [{ url: "/", description: "Same-origin (session cookie auth)" }],
  tags: [
    { name: "Auth", description: "Sign-in session (Auth.js credentials)" },
    { name: "Vehicles", description: "Fleet vehicles, archive/restore, bulk odometer updates" },
    { name: "Service Records", description: "Records, lifecycle transitions, assignments, timeline, export" },
    { name: "Technicians", description: "Technician lookup and scoped record lists" },
    { name: "Dashboard", description: "Fleet-wide and technician-scoped aggregates" },
    { name: "Alerts", description: "Overdue alerts (lazy-created per service cycle)" },
    { name: "Daily Reports", description: "Role-based end-of-day reports (5 PM local gate)" },
    { name: "Users", description: "Admin user management" },
    { name: "Search", description: "Universal Ctrl+K search" },
    { name: "Docs", description: "This OpenAPI document" },
  ],
  paths: {
    "/api/auth/csrf": {
      get: {
        tags: ["Auth"],
        summary: "Get a CSRF token",
        description:
          "Auth.js sign-in flow. The credentials sign-in POST requires a csrfToken obtained from this endpoint first.",
        operationId: "getCsrfToken",
        responses: {
          "200": {
            description: "CSRF token",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { csrfToken: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/signin": {
      post: {
        tags: ["Auth"],
        summary: "Sign in with email + password",
        description:
          "Auth.js credentials sign-in. Form-encoded body: csrfToken (from GET /api/auth/csrf), email, password. On success the session cookie is set and the response redirects (or returns 200 when called with the Auth.js callback flow).",
        operationId: "signIn",
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                required: ["csrfToken", "email", "password"],
                properties: {
                  csrfToken: { type: "string", description: "From GET /api/auth/csrf" },
                  email: { type: "string", format: "email", example: "manager@fleet.test" },
                  password: { type: "string", format: "password", example: "password123" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Signed in (session cookie set)" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },
    "/api/auth/signout": {
      post: {
        tags: ["Auth"],
        summary: "Sign out",
        description: "Clears the session cookie.",
        operationId: "signOut",
        responses: {
          "200": { description: "Signed out" },
        },
      },
    },
    "/api/auth/session": {
      get: {
        tags: ["Auth"],
        summary: "Get the current session",
        operationId: "getSession",
        responses: {
          "200": {
            description: "The current session, or null when logged out",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  nullable: true,
                  properties: {
                    user: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        email: { type: "string" },
                        role: { $ref: "#/components/schemas/Role" },
                      },
                    },
                    expires: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    },

    "/api/vehicles": {
      get: {
        tags: ["Vehicles"],
        summary: "List vehicles",
        description:
          "Any authenticated user. Returns non-archived vehicles by default. Pass ?includeArchived=true to include archived ones (archiving hides a vehicle from the default fleet view without destroying its service history).",
        operationId: "listVehicles",
        parameters: [
          {
            name: "includeArchived",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
            description: "Set to true to include archived vehicles.",
          },
        ],
        responses: {
          "200": {
            description: "Vehicles, newest first",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Vehicle" } },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
      post: {
        tags: ["Vehicles"],
        summary: "Create a vehicle",
        description:
          "FLEET_MANAGER or ADMIN only. A new vehicle is considered just serviced: lastServiceDate = now, lastServiceOdometer = currentOdometer, serviceCycle = 1. currentOdometer is not editable later via PATCH — readings only ever move forward (bulk CSV or lifecycle completion).",
        operationId: "createVehicle",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateVehicleInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Created vehicle",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Vehicle" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/vehicles/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Vehicle id (cuid)" },
      ],
      get: {
        tags: ["Vehicles"],
        summary: "Get a vehicle with its service history",
        description:
          "Any authenticated user. Includes the vehicle's serviceRecords (most recent first) — opening a vehicle shows its service history.",
        operationId: "getVehicle",
        responses: {
          "200": {
            description: "Vehicle with service records",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VehicleWithRecords" },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Vehicles"],
        summary: "Update a vehicle",
        description:
          "FLEET_MANAGER or ADMIN only. Updates make, model, dateIntervalDays, mileageInterval. currentOdometer is intentionally not editable here — odometer readings move forward only, via the bulk CSV endpoint or lifecycle completion.",
        operationId: "updateVehicle",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateVehicleInput" } },
          },
        },
        responses: {
          "200": {
            description: "Updated vehicle",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Vehicle" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/vehicles/{id}/archive": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Vehicle id (cuid)" },
      ],
      post: {
        tags: ["Vehicles"],
        summary: "Archive a vehicle",
        description:
          "FLEET_MANAGER or ADMIN only. Sets archivedAt = now. Does not touch service records — the vehicle drops out of the default fleet view but its history is preserved and it can be restored.",
        operationId: "archiveVehicle",
        responses: {
          "200": {
            description: "Archived vehicle",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Vehicle" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/vehicles/{id}/restore": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Vehicle id (cuid)" },
      ],
      post: {
        tags: ["Vehicles"],
        summary: "Restore an archived vehicle",
        description: "FLEET_MANAGER or ADMIN only. Sets archivedAt = null.",
        operationId: "restoreVehicle",
        responses: {
          "200": {
            description: "Restored vehicle",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Vehicle" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/vehicles/bulk-odometer": {
      post: {
        tags: ["Vehicles"],
        summary: "Bulk-update odometer readings from CSV",
        description:
          "FLEET_MANAGER or ADMIN only. Multipart upload (form field 'file') of a CSV with columns registrationNumber, odometerReading. Rows are processed one at a time — a rejected row never rolls back the valid rows. A row is rejected (with a reason) when the registration is unknown or the reading is lower than the vehicle's current recorded reading. Returns a per-row report.",
        operationId: "bulkUpdateOdometer",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", description: "CSV file: registrationNumber,odometerReading" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Per-row results",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/BulkOdometerResponse" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },

    "/api/service-records": {
      get: {
        tags: ["Service Records"],
        summary: "List service records (search/filter/sort/pagination)",
        description:
          "Any authenticated user. The single server-driven list endpoint: text search over description, filters for vehicle/status/technician, sorting, pagination — all expressed in the Prisma query. A TECHNICIAN caller is silently scoped to records they are actively assigned to (their technicianId filter is overridden server-side, never applied as-is). 'overdue' is a derived status: DUE past the shared grace period.",
        operationId: "listServiceRecords",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" }, description: "Case-insensitive text search over description." },
          { name: "vehicleId", in: "query", schema: { type: "string" }, description: "Exact vehicle filter." },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/ServiceStatus" }, description: "Exact status filter." },
          { name: "overdue", in: "query", schema: { type: "string", enum: ["true", "false"] }, description: "When true, only DUE records past the grace period." },
          { name: "technicianId", in: "query", schema: { type: "string" }, description: "Records with an active assignment for this technician (ignored/overridden for a technician caller)." },
          { name: "sortBy", in: "query", schema: { type: "string", enum: ["scheduledDate", "status", "updatedAt"], default: "updatedAt" } },
          { name: "sortDir", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Paginated list",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServiceRecordListResponse" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
      post: {
        tags: ["Service Records"],
        summary: "Create a service record",
        description:
          "FLEET_MANAGER or ADMIN only. A record starts as DUE with dueSince = now and a CREATED history event. Booking (scheduling + assigning a technician) is a separate lifecycle step via the transition endpoint.",
        operationId: "createServiceRecord",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateServiceRecordInput" } },
          },
        },
        responses: {
          "201": {
            description: "Created record (status DUE)",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServiceRecord" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/service-records/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Service record id (cuid)" },
      ],
      get: {
        tags: ["Service Records"],
        summary: "Get a service record with vehicle + active assignments",
        description:
          "Any authenticated user who can see the record. A technician may view records they are or were assigned to (their active jobs and their completed history); a manager/admin can fetch any. Returns only currently-active assignments.",
        operationId: "getServiceRecord",
        responses: {
          "200": {
            description: "Record with vehicle and active assignments",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServiceRecordDetail" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
      patch: {
        tags: ["Service Records"],
        summary: "Update a record description",
        description:
          "FLEET_MANAGER/ADMIN, or a technician with an active assignment to this record. Only the description is editable here — this is deliberately NOT a path to reassignment (assignment changes are manager-only under /assignments).",
        operationId: "updateServiceRecordDescription",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateServiceRecordDescriptionInput" } },
          },
        },
        responses: {
          "200": {
            description: "Updated record",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServiceRecord" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/service-records/{id}/transition": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Service record id (cuid)" },
      ],
      post: {
        tags: ["Service Records"],
        summary: "Move a record through the lifecycle (BOOK / START / COMPLETE)",
        description:
          "The enforced state machine: DUE → BOOKED via BOOK (requires scheduledDate + technicianId, manager-only), BOOKED → IN_SERVICE via START (assigned technician or manager), IN_SERVICE → COMPLETED via COMPLETE (requires completedOdometer >= the vehicle's currentOdometer; assigned technician or manager). An illegal move is rejected with 409 and a message naming the illegal transition. COMPLETE atomically resets the vehicle's date + mileage counters and increments its service cycle in the same transaction as the record update and the audit events. BOOK creates the initial assignment plus ASSIGNED and STATUS_CHANGE history events.",
        operationId: "transitionServiceRecord",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TransitionInput" } },
          },
        },
        responses: {
          "200": {
            description: "Record after the transition",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServiceRecord" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": {
            description: "Illegal transition — the response body is the state machine's exact reason",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: {
                      type: "string",
                      example: "Cannot move from COMPLETED to BOOKED.",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/service-records/{id}/assignments": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Service record id (cuid)" },
      ],
      post: {
        tags: ["Service Records"],
        summary: "Assign a technician to a record",
        description:
          "FLEET_MANAGER or ADMIN only. Adds a technician after booking. Rejects with 409 if that technician already has an active assignment to this record. Records an ASSIGNED history event naming the technician.",
        operationId: "createAssignment",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateAssignmentInput" } },
          },
        },
        responses: {
          "201": {
            description: "Created assignment",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ServiceAssignment" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },
    "/api/service-records/{id}/assignments/{assignmentId}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Service record id (cuid)" },
        { name: "assignmentId", in: "path", required: true, schema: { type: "string" }, description: "Assignment id (cuid)" },
      ],
      delete: {
        tags: ["Service Records"],
        summary: "Unassign a technician",
        description:
          "FLEET_MANAGER or ADMIN only. Soft-removes the assignment (sets unassignedAt = now — never hard-deletes, so history is preserved) and records an UNASSIGNED history event. Idempotent: unassigning an already-unassigned assignment succeeds as a no-op.",
        operationId: "deleteAssignment",
        responses: {
          "200": {
            description: "Unassigned",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/service-records/{id}/timeline": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Service record id (cuid)" },
      ],
      get: {
        tags: ["Service Records"],
        summary: "Get a record's audit timeline",
        description:
          "Any authenticated user who can see the record (same scoping as the list/detail endpoints). Returns events oldest-first with the actor's name/role resolved and a human-readable summary per event. Read-only — there is no create/update/delete route for history events; the timeline cannot be rewritten.",
        operationId: "getServiceRecordTimeline",
        responses: {
          "200": {
            description: "Timeline events, oldest first",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/TimelineEvent" } },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },
    "/api/service-records/export": {
      get: {
        tags: ["Service Records"],
        summary: "Export service history as CSV",
        description:
          "Any authenticated user. Same authorization + filters as the list endpoint (a technician is scoped to their own active assignments). Streams back a CSV attachment with columns vehicleRegistration, vehicleMakeModel, description, status, scheduledDate, completedAt.",
        operationId: "exportServiceRecords",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "vehicleId", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/ServiceStatus" } },
          { name: "overdue", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "technicianId", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "CSV file download",
            content: {
              "text/csv": {
                schema: { type: "string", format: "binary" },
                example: "vehicleRegistration,vehicleMakeModel,description,status,scheduledDate,completedAt\n\"AB12 CDE\",\"Ford Transit 350\",\"Oil & filter\",\"COMPLETED\",,\"2026-08-01T10:00:00.000Z\"",
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },

    "/api/technicians": {
      get: {
        tags: ["Technicians"],
        summary: "List technicians",
        description: "Any authenticated user. Every technician (id + name) for filter dropdowns.",
        operationId: "listTechnicians",
        responses: {
          "200": {
            description: "Technicians, alphabetical",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },
    "/api/technicians/{id}/service-records": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Technician user id (cuid)" },
      ],
      get: {
        tags: ["Technicians"],
        summary: "Get a technician's service records",
        description:
          "Any authenticated user. Returns every ServiceRecord (with vehicle info) this technician has ever been assigned to — active jobs and completed history. A technician caller may only request their own id (403 otherwise). This powers the 'My Records' page.",
        operationId: "getTechnicianServiceRecords",
        responses: {
          "200": {
            description: "Records with vehicle info",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/ServiceRecordWithVehicle" } },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Dashboard aggregates",
        description:
          "Any authenticated user. A FLEET_MANAGER/ADMIN gets fleet-wide aggregates; a TECHNICIAN gets a personal dashboard scoped to their own assignments (active jobs, personal stats, recent completions). All week bucketing follows the caller's timezone via the X-Timezone header (fallback UTC).",
        operationId: "getDashboard",
        parameters: [
          {
            name: "X-Timezone",
            in: "header",
            required: false,
            schema: { type: "string", example: "Asia/Kolkata" },
            description: "IANA timezone for 'this week' / 8-week bucketing. Falls back to UTC when absent or invalid.",
          },
        ],
        responses: {
          "200": {
            description: "Fleet-wide (manager/admin) or technician-scoped payload",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/DashboardData" },
                    { $ref: "#/components/schemas/TechnicianDashboardData" },
                  ],
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },

    "/api/alerts": {
      get: {
        tags: ["Alerts"],
        summary: "List active overdue alerts",
        description:
          "Any authenticated user. Alert rows are created lazily on read for every vehicle/cycle that is currently overdue, relying on the unique (vehicleId, serviceCycle) constraint (createMany with skipDuplicates). Returns only current-cycle, non-dismissed alerts with a count for the nav badge. The reappearance rule: dismissing cycle N's alert never suppresses a brand-new alert for cycle N+1.",
        operationId: "listAlerts",
        responses: {
          "200": {
            description: "Active alerts + count",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    alerts: { type: "array", items: { $ref: "#/components/schemas/Alert" } },
                    count: { type: "integer", description: "Length of alerts (nav badge)", example: 3 },
                  },
                },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },
    "/api/alerts/{id}/dismiss": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Alert id (cuid)" },
      ],
      post: {
        tags: ["Alerts"],
        summary: "Dismiss an alert",
        description:
          "FLEET_MANAGER or ADMIN only. Stamps dismissedAt + dismissedById (the row is never deleted). Idempotent — dismissing an already-dismissed alert is a no-op success. Because alerts are keyed by service cycle, dismissing cycle N does nothing to suppress cycle N+1.",
        operationId: "dismissAlert",
        responses: {
          "200": {
            description: "Dismissed alert",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Alert" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      },
    },

    "/api/search": {
      get: {
        tags: ["Search"],
        summary: "Universal search (Ctrl+K)",
        description:
          "Any authenticated user. Searches vehicles, service records, and people. A TECHNICIAN is scoped to records they are actively assigned to and never sees vehicles or management accounts; a manager/admin sees all non-archived vehicles, all records, and all people.",
        operationId: "search",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string", maxLength: 100 }, description: "Search text (case-insensitive, max 100 chars)." },
        ],
        responses: {
          "200": {
            description: "Grouped results",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
        },
      },
    },

    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List non-admin users",
        description:
          "ADMIN only. Every fleet manager and technician with their active-assignment count, so the user-management page shows at a glance who is working on what before deleting anyone.",
        operationId: "listUsers",
        responses: {
          "200": {
            description: "Non-admin users",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/UserRow" } },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create a fleet manager or technician",
        description:
          "ADMIN only. The role is constrained server-side to FLEET_MANAGER / TECHNICIAN — an admin cannot mint a new ADMIN through this endpoint (admins are created by seeding).",
        operationId: "createUser",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateUserInput" } },
          },
        },
        responses: {
          "201": {
            description: "Created user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    email: { type: "string" },
                    role: { $ref: "#/components/schemas/Role" },
                  },
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },
    "/api/users/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" }, description: "User id (cuid)" },
      ],
      delete: {
        tags: ["Users"],
        summary: "Delete a user",
        description:
          "ADMIN only. Admins themselves can never be deleted through this endpoint, and a user with an active service assignment is refused (409) until those assignments are unassigned — no record is orphaned.",
        operationId: "deleteUser",
        responses: {
          "200": {
            description: "Deleted",
            content: {
              "application/json": {
                schema: { type: "object", properties: { ok: { type: "boolean", example: true } } },
              },
            },
          },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "409": { $ref: "#/components/responses/Conflict" },
        },
      },
    },

    "/api/daily-reports": {
      get: {
        tags: ["Daily Reports"],
        summary: "Get daily reports",
        description:
          "Any authenticated user. Role-scoped: a technician sees only their own report for the date; a fleet manager sees their own + all technicians'; an admin sees everyone's. ?date=YYYY-MM-DD selects a local calendar day (default: today); ?authorId filters to one visible author; ?history=true returns the caller's own recent reports instead. The 5 PM gate and day bucketing follow the X-Timezone header.",
        operationId: "getDailyReports",
        parameters: [
          {
            name: "X-Timezone",
            in: "header",
            required: false,
            schema: { type: "string", example: "Asia/Kolkata" },
            description: "IANA timezone for 'today' and day bucketing. Falls back to UTC when absent or invalid.",
          },
          { name: "date", in: "query", schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", example: "2026-09-04" }, description: "Local calendar day (defaults to today)." },
          { name: "authorId", in: "query", schema: { type: "string" }, description: "Restrict to one author the caller may view." },
          { name: "history", in: "query", schema: { type: "string", enum: ["true", "false"] }, description: "When true, returns the caller's own recent reports (no date window)." },
        ],
        responses: {
          "200": {
            description: "A single technician report, a manager review set, or the caller's history",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/DailyReportSelfResponse" },
                    { $ref: "#/components/schemas/DailyReportListResponse" },
                    { $ref: "#/components/schemas/DailyReportHistoryResponse" },
                  ],
                },
              },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
      post: {
        tags: ["Daily Reports"],
        summary: "File or update today's daily report",
        description:
          "FLEET_MANAGER or TECHNICIAN only (admins review, they do not file). Rejected with 403 before 5 PM local (X-Timezone). Upserts on (authorId, local-midnight-of-today) so re-submitting edits today's report rather than duplicating it. The payload is a discriminated union on reportType and must match the caller's role — a technician cannot submit a manager-shaped payload.",
        operationId: "submitDailyReport",
        parameters: [
          {
            name: "X-Timezone",
            in: "header",
            required: false,
            schema: { type: "string", example: "Asia/Kolkata" },
            description: "IANA timezone for the 5 PM gate and the report's local day. Falls back to UTC.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/DailyReportSubmitInput" } },
          },
        },
        responses: {
          "201": {
            description: "Filed/updated report",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DailyReportSelfResponse" } },
            },
          },
          "400": { $ref: "#/components/responses/ValidationError" },
          "401": { $ref: "#/components/responses/Unauthenticated" },
          "403": { $ref: "#/components/responses/Forbidden" },
        },
      },
    },

    "/api/docs": {
      get: {
        tags: ["Docs"],
        summary: "OpenAPI 3.0 specification (JSON)",
        description: "The raw OpenAPI document that powers the /api-docs Swagger UI page.",
        operationId: "getOpenApiSpec",
        responses: {
          "200": {
            description: "The OpenAPI document",
            content: {
              "application/json": {
                schema: { type: "object", description: "The full OpenAPI 3.0.3 document." },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "authjs.session-token",
        description:
          "Auth.js JWT session cookie (prefixed __Secure- over HTTPS). Set by signing in via POST /api/auth/signin. Swagger UI sends it automatically on same-origin requests.",
      },
    },
    schemas: {
      Role: {
        type: "string",
        enum: ["ADMIN", "FLEET_MANAGER", "TECHNICIAN"],
      },
      ServiceStatus: {
        type: "string",
        enum: ["DUE", "BOOKED", "IN_SERVICE", "COMPLETED"],
      },
      HistoryEventType: {
        type: "string",
        enum: ["CREATED", "STATUS_CHANGE", "ASSIGNED", "UNASSIGNED", "NOTE"],
      },
      DateTime: { type: "string", format: "date-time" },

      Vehicle: {
        type: "object",
        description: "A fleet vehicle. currentOdometer/interval fields are integers (km/days).",
        properties: {
          id: { type: "string" },
          registrationNumber: { type: "string", example: "AB12 CDE" },
          make: { type: "string", example: "Ford" },
          model: { type: "string", example: "Transit 350" },
          currentOdometer: { type: "integer", example: 84320 },
          dateIntervalDays: { type: "integer", example: 180 },
          mileageInterval: { type: "integer", example: 15000 },
          lastServiceDate: { $ref: "#/components/schemas/DateTime", nullable: true },
          lastServiceOdometer: { type: "integer", nullable: true },
          serviceCycle: { type: "integer", example: 1 },
          archivedAt: { $ref: "#/components/schemas/DateTime", nullable: true },
          createdAt: { $ref: "#/components/schemas/DateTime" },
          updatedAt: { $ref: "#/components/schemas/DateTime" },
        },
        required: ["id", "registrationNumber", "make", "model", "currentOdometer", "dateIntervalDays", "mileageInterval", "serviceCycle", "createdAt", "updatedAt"],
      },
      VehicleWithRecords: {
        type: "object",
        description: "A vehicle with its serviceRecords embedded (most recent first).",
        allOf: [
          { $ref: "#/components/schemas/Vehicle" },
          {
            type: "object",
            properties: {
              serviceRecords: {
                type: "array",
                items: { $ref: "#/components/schemas/ServiceRecord" },
              },
            },
          },
        ],
      },
      CreateVehicleInput: {
        type: "object",
        required: ["registrationNumber", "make", "model", "currentOdometer", "dateIntervalDays", "mileageInterval"],
        properties: {
          registrationNumber: { type: "string", minLength: 1, example: "AB12 CDE" },
          make: { type: "string", minLength: 1, example: "Ford" },
          model: { type: "string", minLength: 1, example: "Transit 350" },
          currentOdometer: { type: "integer", minimum: 1, example: 50000 },
          dateIntervalDays: { type: "integer", minimum: 1, example: 180 },
          mileageInterval: { type: "integer", minimum: 1, example: 15000 },
        },
      },
      UpdateVehicleInput: {
        type: "object",
        description: "currentOdometer is deliberately absent — readings only move forward via the bulk CSV endpoint or lifecycle completion.",
        required: ["make", "model", "dateIntervalDays", "mileageInterval"],
        properties: {
          make: { type: "string", minLength: 1 },
          model: { type: "string", minLength: 1 },
          dateIntervalDays: { type: "integer", minimum: 1 },
          mileageInterval: { type: "integer", minimum: 1 },
        },
      },
      BulkOdometerResponse: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                row: { type: "integer", description: "1-based CSV row (header is row 1)" },
                registrationNumber: { type: "string" },
                status: { type: "string", enum: ["success", "rejected"] },
                reason: {
                  type: "string",
                  nullable: true,
                  example: "New reading 12000 is lower than current recorded reading 84320.",
                },
              },
            },
          },
          successCount: { type: "integer", example: 2 },
          rejectedCount: { type: "integer", example: 1 },
        },
      },

      ServiceRecord: {
        type: "object",
        description: "A service record. Lifecycle: DUE → BOOKED → IN_SERVICE → COMPLETED.",
        properties: {
          id: { type: "string" },
          vehicleId: { type: "string" },
          description: { type: "string", example: "Oil & filter change" },
          status: { $ref: "#/components/schemas/ServiceStatus" },
          scheduledDate: { $ref: "#/components/schemas/DateTime", nullable: true },
          startedAt: { $ref: "#/components/schemas/DateTime", nullable: true },
          completedAt: { $ref: "#/components/schemas/DateTime", nullable: true },
          completedOdometer: { type: "integer", nullable: true },
          dueSince: { $ref: "#/components/schemas/DateTime" },
          createdAt: { $ref: "#/components/schemas/DateTime" },
          updatedAt: { $ref: "#/components/schemas/DateTime" },
        },
        required: ["id", "vehicleId", "description", "status", "dueSince", "createdAt", "updatedAt"],
      },
      ServiceRecordWithVehicle: {
        type: "object",
        description: "A service record with its vehicle embedded.",
        allOf: [
          { $ref: "#/components/schemas/ServiceRecord" },
          {
            type: "object",
            properties: {
              vehicle: { $ref: "#/components/schemas/Vehicle" },
            },
          },
        ],
      },
      ServiceRecordListItem: {
        type: "object",
        description: "A list row: record + vehicle registration + active assignments.",
        allOf: [
          { $ref: "#/components/schemas/ServiceRecord" },
          {
            type: "object",
            properties: {
              vehicle: {
                type: "object",
                properties: { registrationNumber: { type: "string" } },
              },
              assignments: {
                type: "array",
                description: "Currently active assignments (unassignedAt is null).",
                items: {
                  type: "object",
                  properties: {
                    technician: {
                      type: "object",
                      properties: { name: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      ServiceRecordListResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/ServiceRecordListItem" } },
          total: { type: "integer", example: 42 },
          page: { type: "integer", example: 1 },
          pageSize: { type: "integer", example: 20 },
        },
      },
      ServiceRecordDetail: {
        type: "object",
        description: "Record + full vehicle + currently active assignments (technician id + name).",
        allOf: [
          { $ref: "#/components/schemas/ServiceRecord" },
          {
            type: "object",
            properties: {
              vehicle: { $ref: "#/components/schemas/Vehicle" },
              assignments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    technicianId: { type: "string" },
                    technician: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      },
      CreateServiceRecordInput: {
        type: "object",
        required: ["vehicleId", "description"],
        properties: {
          vehicleId: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1, example: "Interim service" },
        },
      },
      UpdateServiceRecordDescriptionInput: {
        type: "object",
        required: ["description"],
        properties: {
          description: { type: "string", minLength: 1 },
        },
      },
      TransitionInput: {
        type: "object",
        description:
          "Discriminated by action. BOOK: DUE → BOOKED (manager-only, requires scheduledDate + technicianId). START: BOOKED → IN_SERVICE (no extra payload). COMPLETE: IN_SERVICE → COMPLETED (requires completedOdometer >= the vehicle's current odometer).",
        required: ["action"],
        oneOf: [
          {
            type: "object",
            required: ["action", "scheduledDate", "technicianId"],
            properties: {
              action: { type: "string", enum: ["BOOK"] },
              scheduledDate: { type: "string", format: "date-time", example: "2026-09-12T09:00:00.000Z" },
              technicianId: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["action"],
            properties: {
              action: { type: "string", enum: ["START"] },
            },
          },
          {
            type: "object",
            required: ["action", "completedOdometer"],
            properties: {
              action: { type: "string", enum: ["COMPLETE"] },
              completedOdometer: { type: "integer", minimum: 0, example: 85200 },
            },
          },
        ],
      },
      ServiceAssignment: {
        type: "object",
        properties: {
          id: { type: "string" },
          serviceRecordId: { type: "string" },
          technicianId: { type: "string" },
          assignedAt: { $ref: "#/components/schemas/DateTime" },
          unassignedAt: { $ref: "#/components/schemas/DateTime", nullable: true, description: "Set on soft-remove (UNASSIGNED); null while active." },
        },
      },
      CreateAssignmentInput: {
        type: "object",
        required: ["technicianId"],
        properties: {
          technicianId: { type: "string", minLength: 1 },
        },
      },
      TimelineEvent: {
        type: "object",
        description: "One append-only history event, formatted server-side.",
        properties: {
          id: { type: "string" },
          type: { $ref: "#/components/schemas/HistoryEventType" },
          createdAt: { $ref: "#/components/schemas/DateTime" },
          actor: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              role: { $ref: "#/components/schemas/Role" },
            },
          },
          technician: {
            type: "object",
            nullable: true,
            description: "The technician an ASSIGNED/UNASSIGNED event refers to (null otherwise).",
            properties: { name: { type: "string" } },
          },
          summary: {
            type: "string",
            example: "Fleet Manager assigned Technician One",
            description: "Human-readable summary, generated server-side.",
          },
        },
      },

      DashboardData: {
        type: "object",
        description: "Fleet-wide dashboard for a FLEET_MANAGER/ADMIN caller.",
        properties: {
          dueCount: { type: "integer", description: "Vehicles with an active DUE service record." },
          inServiceCount: { type: "integer" },
          completedThisWeek: { type: "integer", description: "Completions in the caller's current local week." },
          overdueCount: { type: "integer", description: "DUE records past the shared grace period." },
          byStatus: {
            type: "object",
            additionalProperties: { type: "integer" },
            description: "Count of records per status (every status key present, zero-filled).",
          },
          byTechnician: {
            type: "object",
            additionalProperties: { type: "integer" },
            description: "Active assignment count per technicianId.",
          },
          completedPerWeek: {
            type: "array",
            description: "Last 8 local weeks, oldest first, zero-filled (continuous x-axis).",
            items: {
              type: "object",
              properties: {
                week: { type: "string", example: "2026-W35" },
                count: { type: "integer" },
              },
            },
          },
        },
      },
      TechnicianDashboardData: {
        type: "object",
        description: "Technician-scoped dashboard payload.",
        properties: {
          role: { type: "string", enum: ["TECHNICIAN"] },
          technician: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" } },
          },
          assigned: {
            type: "array",
            description: "The technician's active assignments.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                status: { $ref: "#/components/schemas/ServiceStatus" },
                description: { type: "string" },
                scheduledDate: { $ref: "#/components/schemas/DateTime", nullable: true },
                startedAt: { $ref: "#/components/schemas/DateTime", nullable: true },
                dueSince: { $ref: "#/components/schemas/DateTime" },
                vehicle: { $ref: "#/components/schemas/Vehicle" },
              },
            },
          },
          stats: {
            type: "object",
            properties: {
              assignedCount: { type: "integer" },
              dueCount: { type: "integer", description: "Of my assignments: DUE past the grace period." },
              inServiceCount: { type: "integer" },
              completedThisWeek: { type: "integer" },
              completedAllTime: { type: "integer" },
            },
          },
          recentCompleted: {
            type: "array",
            description: "Newest first.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                description: { type: "string" },
                completedAt: { $ref: "#/components/schemas/DateTime" },
                completedOdometer: { type: "integer", nullable: true },
                vehicle: { $ref: "#/components/schemas/Vehicle" },
              },
            },
          },
        },
      },

      Alert: {
        type: "object",
        description: "An overdue alert, keyed to (vehicleId, serviceCycle).",
        properties: {
          id: { type: "string" },
          vehicleId: { type: "string" },
          serviceCycle: { type: "integer" },
          triggeredAt: { $ref: "#/components/schemas/DateTime" },
          dismissedAt: { $ref: "#/components/schemas/DateTime", nullable: true },
          dismissedById: { type: "string", nullable: true },
          vehicle: { $ref: "#/components/schemas/Vehicle" },
        },
      },

      SearchResponse: {
        type: "object",
        properties: {
          vehicles: {
            type: "array",
            description: "Manager/admin only — technicians get an empty array.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                registrationNumber: { type: "string" },
                make: { type: "string" },
                model: { type: "string" },
                currentOdometer: { type: "integer" },
                archivedAt: { $ref: "#/components/schemas/DateTime", nullable: true },
              },
            },
          },
          serviceRecords: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                description: { type: "string" },
                status: { $ref: "#/components/schemas/ServiceStatus" },
                vehicle: {
                  type: "object",
                  properties: { registrationNumber: { type: "string" } },
                },
              },
            },
          },
          technicians: { type: "array", items: { $ref: "#/components/schemas/PersonHit" } },
          managers: {
            type: "array",
            description: "Manager/admin only — technicians get an empty array.",
            items: { $ref: "#/components/schemas/PersonHit" },
          },
        },
      },
      PersonHit: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          role: { $ref: "#/components/schemas/Role" },
        },
      },

      UserRow: {
        type: "object",
        description: "A non-admin user with their active-assignment count.",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          role: { $ref: "#/components/schemas/Role" },
          createdAt: { $ref: "#/components/schemas/DateTime" },
          activeAssignments: { type: "integer" },
        },
      },
      CreateUserInput: {
        type: "object",
        description: "ADMIN can only create FLEET_MANAGER or TECHNICIAN users (never another ADMIN).",
        required: ["name", "email", "password", "role"],
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8, format: "password" },
          role: { type: "string", enum: ["FLEET_MANAGER", "TECHNICIAN"] },
        },
      },

      DailyReportSubmitInput: {
        type: "object",
        description: "Discriminated union on reportType. Must match the caller's role.",
        required: ["reportType"],
        oneOf: [
          {
            type: "object",
            required: ["reportType", "jobsCompleted", "hoursWorked"],
            properties: {
              reportType: { type: "string", enum: ["TECHNICIAN"] },
              jobsCompleted: { type: "integer", minimum: 0 },
              hoursWorked: { type: "integer", minimum: 0, maximum: 24 },
              registrations: { type: "string", description: "One vehicle registration per line." },
              issues: { type: "string" },
            },
          },
          {
            type: "object",
            required: ["reportType", "bookingsCount", "inspectionsCount"],
            properties: {
              reportType: { type: "string", enum: ["FLEET_MANAGER"] },
              bookingsCount: { type: "integer", minimum: 0 },
              inspectionsCount: { type: "integer", minimum: 0 },
              notes: { type: "string" },
            },
          },
        ],
      },
      DailyReport: {
        type: "object",
        properties: {
          id: { type: "string" },
          authorId: { type: "string" },
          authorName: { type: "string" },
          role: { type: "string", enum: ["TECHNICIAN", "FLEET_MANAGER"] },
          reportDate: { $ref: "#/components/schemas/DateTime", description: "UTC instant of local midnight of the report's day." },
          type: { type: "string", enum: ["TECHNICIAN", "FLEET_MANAGER"] },
          jobsCompleted: { type: "integer" },
          hoursWorked: { type: "integer" },
          registrations: { type: "string" },
          bookingsCount: { type: "integer" },
          inspectionsCount: { type: "integer" },
          notes: { type: "string" },
          createdAt: { $ref: "#/components/schemas/DateTime" },
          updatedAt: { $ref: "#/components/schemas/DateTime" },
        },
      },
      DailyReportSelfResponse: {
        type: "object",
        description: "A technician's own report for a day (report is null when not yet filed).",
        properties: {
          report: { $ref: "#/components/schemas/DailyReport", nullable: true },
        },
      },
      DailyReportListResponse: {
        type: "object",
        description: "A manager/admin review set for one local day.",
        properties: {
          date: { type: "string", example: "2026-09-04" },
          reports: { type: "array", items: { $ref: "#/components/schemas/DailyReport" } },
          authors: {
            type: "array",
            description: "The people whose reports the caller may view, for the author filter.",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                role: { type: "string", enum: ["FLEET_MANAGER", "TECHNICIAN"] },
              },
            },
          },
        },
      },
      DailyReportHistoryResponse: {
        type: "object",
        description: "The caller's own past reports (newest first, max 30).",
        properties: {
          reports: { type: "array", items: { $ref: "#/components/schemas/DailyReport" } },
        },
      },

      ErrorBody: {
        type: "object",
        properties: {
          error: { type: "string", example: "You must be signed in." },
          details: {
            type: "object",
            nullable: true,
            description: "Zod flatten() output present on 400s.",
          },
        },
      },
    },
    responses: {
      Unauthenticated: {
        description: "Not signed in (or session expired).",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorBody" },
          },
        },
      },
      Forbidden: {
        description: "The caller's role (or assignment) does not permit this action.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorBody" },
          },
        },
      },
      ValidationError: {
        description: "Request body or query failed Zod validation.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorBody" },
          },
        },
      },
      NotFound: {
        description: "The resource does not exist.",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorBody" },
          },
        },
      },
      Conflict: {
        description: "A uniqueness or state conflict (duplicate registration/assignment, active assignment blocking deletion).",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorBody" },
          },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof openApiSpec;
