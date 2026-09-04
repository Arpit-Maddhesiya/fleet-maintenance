import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import {
  Role,
  ServiceStatus,
  HistoryEventType,
  DailyReportType,
} from "@/generated/prisma/enums";

/**
 * Idempotent demo seed.
 *
 * Fleet data (vehicles, records, assignments, history, alerts) is wiped and
 * rebuilt on every run; demo users are upserted so their ids stay stable.
 *
 * The dataset is internally coherent with how the app reads it:
 *  - alerts: a stored Alert row per overdue vehicle (DUE record older than the
 *    7-day grace) for its CURRENT serviceCycle — matching the unique
 *    (vehicleId, serviceCycle) constraint and the lazy-creation rule in
 *    GET /api/alerts
 *  - dashboard: COMPLETED records spread over the last 8 ISO weeks feed the
 *    weekly chart; vehicles with a DUE record feed dueCount/overdueCount;
 *    IN_SERVICE feeds inServiceCount; active assignments (unassignedAt null)
 *    feed byTechnician
 *  - vehicles: lastServiceDate/lastServiceOdometer/serviceCycle reflect the
 *    most recent completed service (what the COMPLETE transition writes), and
 *    completedOdometer never exceeds the vehicle's currentOdometer
 *  - assignments only ever point at TECHNICIAN users (the API enforces this)
 */

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const weeksAgo = (weeks: number, dayOffset = 0) => daysAgo(weeks * 7 + dayOffset);

type OpenStatus = "DUE" | "BOOKED" | "IN_SERVICE";

interface HistoryEntry {
  label: string;
  /** How long ago this service was completed. */
  weeksAgo: number;
  /** Odometer reading at completion (≤ the vehicle's current odometer). */
  odo: number;
}

interface VehicleSpec {
  registrationNumber: string;
  make: string;
  model: string;
  currentOdometer: number;
  dateIntervalDays: number;
  mileageInterval: number;
  /** When the vehicle was archived (after its last service). */
  archivedWeeksAgo?: number;
  /** Completed services, newest last. */
  history: HistoryEntry[];
  /** The vehicle's current open record, if any. */
  open?: {
    status: OpenStatus;
    description: string;
    /** DUE only: how many days ago it became due (≥8 makes it overdue). */
    dueDaysAgo?: number;
    /** IN_SERVICE only: how many days ago work started. */
    startedDaysAgo?: number;
    /** BOOKED only: how many days until the scheduled date. */
    scheduledInDays?: number;
  };
}

const VEHICLES: VehicleSpec[] = [
  {
    registrationNumber: "AB12 CDE",
    make: "Ford",
    model: "Transit 350",
    currentOdometer: 84_320,
    dateIntervalDays: 180,
    mileageInterval: 15_000,
    history: [
      { label: "Full service", weeksAgo: 40, odo: 42_100 },
      { label: "Oil & filter", weeksAgo: 24, odo: 61_500 },
      { label: "Brake inspection", weeksAgo: 8, odo: 79_900 },
      { label: "Brake pad replacement", weeksAgo: 5, odo: 80_300 },
    ],
    open: {
      status: "DUE",
      description: "Major service — timing belt inspection due",
      dueDaysAgo: 12,
    },
  },
  {
    registrationNumber: "FG34 HIJ",
    make: "Ford",
    model: "Transit Custom",
    currentOdometer: 52_480,
    dateIntervalDays: 180,
    mileageInterval: 15_000,
    history: [
      { label: "Full service", weeksAgo: 30, odo: 30_100 },
      { label: "Interim service", weeksAgo: 10, odo: 48_900 },
      { label: "Air + cabin filter replacement", weeksAgo: 4, odo: 50_100 },
    ],
    open: {
      status: "DUE",
      description: "Interim service",
      dueDaysAgo: 2,
    },
  },
  {
    registrationNumber: "KL56 MNO",
    make: "Mercedes-Benz",
    model: "Sprinter 316",
    currentOdometer: 121_900,
    dateIntervalDays: 365,
    mileageInterval: 25_000,
    history: [
      { label: "Full service", weeksAgo: 52, odo: 72_000 },
      { label: "Full service", weeksAgo: 26, odo: 98_400 },
      { label: "Glow plug replacement", weeksAgo: 6, odo: 115_900 },
      { label: "Full service", weeksAgo: 3, odo: 118_200 },
      { label: "Rear brake discs", weeksAgo: 1, odo: 120_400 },
    ],
    open: {
      status: "IN_SERVICE",
      description: "Annual service + air conditioning recharge",
      startedDaysAgo: 1,
    },
  },
  {
    registrationNumber: "PQ78 RST",
    make: "Mercedes-Benz",
    model: "Sprinter 313",
    currentOdometer: 96_300,
    dateIntervalDays: 365,
    mileageInterval: 25_000,
    history: [
      { label: "Full service", weeksAgo: 46, odo: 58_900 },
      { label: "Full service", weeksAgo: 20, odo: 82_400 },
      { label: "Gearbox oil change", weeksAgo: 2, odo: 93_200 },
    ],
    open: {
      status: "IN_SERVICE",
      description: "Suspension check and wheel alignment",
      startedDaysAgo: 3,
    },
  },
  {
    registrationNumber: "UV90 WXY",
    make: "Volkswagen",
    model: "Crafter 35",
    currentOdometer: 41_150,
    dateIntervalDays: 365,
    mileageInterval: 20_000,
    history: [
      { label: "Full service", weeksAgo: 36, odo: 18_200 },
      { label: "Air conditioning service", weeksAgo: 7, odo: 36_800 },
      { label: "Wheel alignment", weeksAgo: 2, odo: 39_400 },
    ],
    open: {
      status: "BOOKED",
      description: "First annual service",
      scheduledInDays: 4,
    },
  },
  {
    registrationNumber: "ZA12 BCD",
    make: "Volkswagen",
    model: "Crafter 30",
    currentOdometer: 88_500,
    dateIntervalDays: 365,
    mileageInterval: 20_000,
    history: [
      { label: "Full service", weeksAgo: 42, odo: 47_000 },
      { label: "Full service", weeksAgo: 16, odo: 72_100 },
      { label: "Coolant flush", weeksAgo: 3, odo: 84_000 },
    ],
    open: {
      status: "DUE",
      description: "Full service + brake fluid flush",
      dueDaysAgo: 9,
    },
  },
  {
    registrationNumber: "YZ34 WXY",
    make: "Isuzu",
    model: "NPR 4x2",
    currentOdometer: 134_200,
    dateIntervalDays: 180,
    mileageInterval: 12_000,
    history: [
      { label: "Full service", weeksAgo: 32, odo: 96_800 },
      { label: "Oil & filter", weeksAgo: 14, odo: 119_300 },
      { label: "AdBlue system check", weeksAgo: 4, odo: 130_100 },
    ],
    open: {
      status: "DUE",
      description: "Oil & filter change + greasing",
      dueDaysAgo: 25,
    },
  },
  {
    registrationNumber: "BC56 DEF",
    make: "Isuzu",
    model: "NQR 4x2",
    currentOdometer: 76_900,
    dateIntervalDays: 180,
    mileageInterval: 12_000,
    history: [
      { label: "Full service", weeksAgo: 28, odo: 51_600 },
      { label: "Oil & filter", weeksAgo: 6, odo: 71_400 },
      { label: "Tyre rotation + balance", weeksAgo: 1, odo: 75_500 },
      // ~2 days ago (this calendar week) so the dashboard's "Completed this
      // week" card and weekly chart are non-empty on a fresh seed.
      { label: "Brake inspection", weeksAgo: 2 / 7, odo: 76_400 },
    ],
  },
  {
    registrationNumber: "EF78 GHI",
    make: "Renault",
    model: "Master L2H2",
    currentOdometer: 12_800,
    dateIntervalDays: 180,
    mileageInterval: 15_000,
    history: [],
    archivedWeeksAgo: 2,
  },
  {
    registrationNumber: "GH90 IJK",
    make: "Renault",
    model: "Master L3H2",
    currentOdometer: 203_400,
    dateIntervalDays: 365,
    mileageInterval: 25_000,
    history: [
      { label: "Full service", weeksAgo: 44, odo: 148_000 },
      { label: "Full service", weeksAgo: 18, odo: 187_600 },
    ],
    archivedWeeksAgo: 10,
  },
  {
    registrationNumber: "JK12 LMN",
    make: "Ford",
    model: "Transit 350",
    currentOdometer: 67_900,
    dateIntervalDays: 180,
    mileageInterval: 15_000,
    history: [
      { label: "Full service", weeksAgo: 38, odo: 33_200 },
      { label: "Interim service", weeksAgo: 12, odo: 58_700 },
    ],
    open: {
      status: "DUE",
      description: "Interim service",
      dueDaysAgo: 11,
    },
  },
  {
    registrationNumber: "LM34 NOP",
    make: "Mercedes-Benz",
    model: "Vito 119",
    currentOdometer: 45_600,
    dateIntervalDays: 365,
    mileageInterval: 25_000,
    history: [
      { label: "Full service", weeksAgo: 40, odo: 19_400 },
      { label: "Brake inspection", weeksAgo: 4, odo: 42_800 },
    ],
    open: {
      status: "DUE",
      description: "Annual service — brakes and suspension check",
      dueDaysAgo: 14,
    },
  },
  {
    registrationNumber: "NO56 PQR",
    make: "Volkswagen",
    model: "Transporter T6",
    currentOdometer: 112_300,
    dateIntervalDays: 180,
    mileageInterval: 15_000,
    history: [
      { label: "Full service", weeksAgo: 34, odo: 71_900 },
      { label: "Oil & filter", weeksAgo: 10, odo: 103_500 },
    ],
    open: {
      status: "DUE",
      description: "Oil & filter change + inspection",
      dueDaysAgo: 9,
    },
  },
  {
    registrationNumber: "ST78 UVW",
    make: "Isuzu",
    model: "NPR 4x2",
    currentOdometer: 58_200,
    dateIntervalDays: 180,
    mileageInterval: 12_000,
    history: [
      { label: "Full service", weeksAgo: 26, odo: 31_600 },
      { label: "Tyre rotation", weeksAgo: 5, odo: 54_200 },
    ],
    open: {
      status: "DUE",
      description: "AdBlue system check + service",
      dueDaysAgo: 16,
    },
  },
  {
    registrationNumber: "WX90 YZA",
    make: "Renault",
    model: "Master L2H2",
    currentOdometer: 31_750,
    dateIntervalDays: 365,
    mileageInterval: 25_000,
    history: [
      { label: "Full service", weeksAgo: 48, odo: 12_300 },
      { label: "Full service", weeksAgo: 8, odo: 27_900 },
    ],
    open: {
      status: "DUE",
      description: "First annual service",
      dueDaysAgo: 21,
    },
  },
];

const EXTRA_TECHNICIANS = [
  { email: "tech3@fleet.test", name: "Technician Three" },
  { email: "tech4@fleet.test", name: "Technician Four" },
  { email: "tech5@fleet.test", name: "Technician Five" },
];

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash("password123", 10);

  // ------------------------------------------------------------------ users
  const userSpecs = [
    { email: "admin@fleet.test", name: "Administrator", role: Role.ADMIN },
    { email: "manager@fleet.test", name: "Fleet Manager", role: Role.FLEET_MANAGER },
    { email: "tech1@fleet.test", name: "Technician One", role: Role.TECHNICIAN },
    { email: "tech2@fleet.test", name: "Technician Two", role: Role.TECHNICIAN },
    ...EXTRA_TECHNICIANS.map((t) => ({ ...t, role: Role.TECHNICIAN })),
  ];

  const users = [];
  for (const spec of userSpecs) {
    const user = await prisma.user.upsert({
      where: { email: spec.email },
      update: { passwordHash, role: spec.role, name: spec.name },
      create: { ...spec, passwordHash },
    });
    users.push(user);
  }
  const admin = users.find((u) => u.role === Role.ADMIN)!;
  const manager = users.find((u) => u.role === Role.FLEET_MANAGER)!;
  const techs = users.filter((u) => u.role === Role.TECHNICIAN);
  console.log(`Seeded ${users.length} users`);

  // Wipe existing fleet data (dependency order). Users are kept so FKs and any
  // existing sessions keep working.
  await prisma.dailyReport.deleteMany();
  await prisma.serviceHistoryEvent.deleteMany();
  await prisma.serviceAssignment.deleteMany();
  await prisma.serviceRecord.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.vehicle.deleteMany();

  // --------------------------------------------------------------- vehicles
  const vehicles = [];
  for (const spec of VEHICLES) {
    const last = spec.history[spec.history.length - 1];
    const vehicle = await prisma.vehicle.create({
      data: {
        registrationNumber: spec.registrationNumber,
        make: spec.make,
        model: spec.model,
        currentOdometer: spec.currentOdometer,
        dateIntervalDays: spec.dateIntervalDays,
        mileageInterval: spec.mileageInterval,
        archivedAt: spec.archivedWeeksAgo ? weeksAgo(spec.archivedWeeksAgo) : null,
        // Coherent with the most recent completed service (as the COMPLETE
        // transition would have left the vehicle).
        lastServiceDate: last ? weeksAgo(last.weeksAgo) : null,
        lastServiceOdometer: last?.odo ?? null,
        serviceCycle: spec.history.length + 1,
      },
    });
    vehicles.push({ vehicle, spec });
  }
  console.log(`Seeded ${vehicles.length} vehicles`);

  const vehicleByReg = new Map(vehicles.map((v) => [v.vehicle.registrationNumber, v]));

  // --------------------------------------------------------- service records
  interface RecToInsert {
    vehicleId: string;
    description: string;
    status: ServiceStatus;
    createdAt: Date;
    dueSince: Date;
    scheduledDate?: Date | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    completedOdometer?: number | null;
    /** Technician assigned to the record (undefined = none yet). */
    tech?: (typeof techs)[number];
    /** Audit trail, oldest first. */
    events: {
      type: HistoryEventType;
      at: Date;
      actor: (typeof users)[number];
      fromStatus?: ServiceStatus;
      toStatus?: ServiceStatus;
      technician?: (typeof techs)[number];
    }[];
    /** Active (unassignedAt null) assignment? Set for BOOKED/IN_SERVICE. */
    activeAssignment?: { assignedAt: Date; tech: (typeof techs)[number] };
    /** Closed assignment (completed work). */
    closedAssignment?: { assignedAt: Date; unassignedAt: Date; tech: (typeof techs)[number] };
  }

  const rows: RecToInsert[] = [];

  // Each vehicle's completed history entries become COMPLETED records with a
  // full audit trail. Oldest first (reverse of the history array).
  for (const { vehicle, spec } of vehicles) {
    const entries = [...spec.history].reverse();
    entries.forEach((entry, i) => {
      const tech = techs[i % techs.length];
      const createdAt = weeksAgo(entry.weeksAgo, 3);
      const completedAt = weeksAgo(entry.weeksAgo);
      const bookedAt = weeksAgo(entry.weeksAgo, 1);
      const startedAt = weeksAgo(entry.weeksAgo, 0.5);
      const assignedAt = weeksAgo(entry.weeksAgo, 1.5);

      rows.push({
        vehicleId: vehicle.id,
        description: entry.label,
        status: ServiceStatus.COMPLETED,
        createdAt,
        dueSince: weeksAgo(entry.weeksAgo, 3),
        completedAt,
        completedOdometer: entry.odo,
        closedAssignment: { assignedAt, unassignedAt: completedAt, tech },
        events: [
          {
            type: HistoryEventType.CREATED,
            at: createdAt,
            actor: manager,
          },
          { type: HistoryEventType.ASSIGNED, at: assignedAt, actor: manager, technician: tech },
          {
            type: HistoryEventType.STATUS_CHANGE,
            at: bookedAt,
            actor: manager,
            fromStatus: ServiceStatus.DUE,
            toStatus: ServiceStatus.BOOKED,
          },
          {
            type: HistoryEventType.STATUS_CHANGE,
            at: startedAt,
            actor: tech,
            fromStatus: ServiceStatus.BOOKED,
            toStatus: ServiceStatus.IN_SERVICE,
          },
          {
            type: HistoryEventType.STATUS_CHANGE,
            at: completedAt,
            actor: tech,
            fromStatus: ServiceStatus.IN_SERVICE,
            toStatus: ServiceStatus.COMPLETED,
          },
        ],
      });
    });
  }

  // Open records (DUE / BOOKED / IN_SERVICE).
  vehicles.forEach(({ vehicle, spec }, vi) => {
    if (!spec.open) return;
    const open = spec.open;
    const tech = techs[vi % techs.length];
    const dueSince = open.dueDaysAgo !== undefined ? daysAgo(open.dueDaysAgo) : daysAgo(0);

    if (open.status === "DUE") {
      rows.push({
        vehicleId: vehicle.id,
        description: open.description,
        status: ServiceStatus.DUE,
        createdAt: dueSince,
        dueSince,
        events: [
          {
            type: HistoryEventType.CREATED,
            at: new Date(dueSince.getTime() - DAY),
            actor: manager,
          },
        ],
      });
    } else if (open.status === "BOOKED") {
      const createdAt = daysAgo(10);
      const bookedAt = daysAgo(6);
      rows.push({
        vehicleId: vehicle.id,
        description: open.description,
        status: ServiceStatus.BOOKED,
        createdAt,
        dueSince: daysAgo(10),
        scheduledDate: open.scheduledInDays !== undefined ? daysAgo(-open.scheduledInDays) : daysAgo(3),
        activeAssignment: { assignedAt: bookedAt, tech },
        events: [
          { type: HistoryEventType.CREATED, at: createdAt, actor: manager },
          { type: HistoryEventType.ASSIGNED, at: bookedAt, actor: manager, technician: tech },
          {
            type: HistoryEventType.STATUS_CHANGE,
            at: bookedAt,
            actor: manager,
            fromStatus: ServiceStatus.DUE,
            toStatus: ServiceStatus.BOOKED,
          },
        ],
      });
    } else {
      // IN_SERVICE
      const createdAt = daysAgo(open.startedDaysAgo! + 6);
      const bookedAt = daysAgo(open.startedDaysAgo! + 5);
      const startedAt = daysAgo(open.startedDaysAgo ?? 1);
      const assignedAt = daysAgo(open.startedDaysAgo! + 5);
      rows.push({
        vehicleId: vehicle.id,
        description: open.description,
        status: ServiceStatus.IN_SERVICE,
        createdAt,
        dueSince: createdAt,
        startedAt,
        activeAssignment: { assignedAt, tech },
        events: [
          { type: HistoryEventType.CREATED, at: createdAt, actor: manager },
          { type: HistoryEventType.ASSIGNED, at: assignedAt, actor: manager, technician: tech },
          {
            type: HistoryEventType.STATUS_CHANGE,
            at: bookedAt,
            actor: manager,
            fromStatus: ServiceStatus.DUE,
            toStatus: ServiceStatus.BOOKED,
          },
          {
            type: HistoryEventType.STATUS_CHANGE,
            at: startedAt,
            actor: tech,
            fromStatus: ServiceStatus.BOOKED,
            toStatus: ServiceStatus.IN_SERVICE,
          },
        ],
      });
    }
  });

  // Insert oldest first so createdAt ordering is natural.
  rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  let recordCount = 0;
  for (const row of rows) {
    const record = await prisma.serviceRecord.create({
      data: {
        vehicleId: row.vehicleId,
        description: row.description,
        status: row.status,
        dueSince: row.dueSince,
        scheduledDate: row.scheduledDate ?? null,
        startedAt: row.startedAt ?? null,
        completedAt: row.completedAt ?? null,
        completedOdometer: row.completedOdometer ?? null,
        createdAt: row.createdAt,
        // The rows are backdated history, so updatedAt must reflect the last
        // real activity on the record, not the seed-insert time. Otherwise
        // Prisma's @updatedAt (now) makes every completed record look like it
        // was edited on seed day — the "Updated" filter would match them all.
        updatedAt: row.completedAt ?? row.createdAt,
      },
    });

    if (row.activeAssignment) {
      await prisma.serviceAssignment.create({
        data: {
          serviceRecordId: record.id,
          technicianId: row.activeAssignment.tech.id,
          assignedAt: row.activeAssignment.assignedAt,
          unassignedAt: null,
        },
      });
    }
    if (row.closedAssignment) {
      await prisma.serviceAssignment.create({
        data: {
          serviceRecordId: record.id,
          technicianId: row.closedAssignment.tech.id,
          assignedAt: row.closedAssignment.assignedAt,
          unassignedAt: row.closedAssignment.unassignedAt,
        },
      });
    }

    for (const ev of row.events) {
      await prisma.serviceHistoryEvent.create({
        data: {
          serviceRecordId: record.id,
          type: ev.type,
          actorId: ev.actor.id,
          fromStatus: ev.fromStatus ?? null,
          toStatus: ev.toStatus ?? null,
          technicianId: ev.technician?.id ?? null,
          createdAt: ev.at,
        },
      });
    }
    recordCount++;
  }
  console.log(`Seeded ${recordCount} service records`);

  // ----------------------------------------------------------------- alerts
  // One Alert row per overdue vehicle (DUE record past the 7-day grace) for its
  // current serviceCycle — the same rows GET /api/alerts would lazily create.
  // createMany+skipDuplicates mirrors the API and keeps the seed robust if a
  // concurrently running app instance lazily creates an alert mid-seed.
  const overdueAlerts = vehicles
    .filter(
      ({ spec }) =>
        spec.open?.status === "DUE" && (spec.open.dueDaysAgo ?? 0) > 7
    )
    .map(({ vehicle }) => ({
      vehicleId: vehicle.id,
      serviceCycle: vehicle.serviceCycle,
      triggeredAt: daysAgo(7),
    }));
  const { count: alertCount } = await prisma.alert.createMany({
    data: overdueAlerts,
    skipDuplicates: true,
  });
  console.log(`Seeded ${alertCount} overdue alerts`);

  // A dismissed alert for variety (older cycle on an active vehicle).
  const dismissedVehicle = vehicleByReg.get("FG34 HIJ")!.vehicle;
  await prisma.alert.createMany({
    data: [
      {
        vehicleId: dismissedVehicle.id,
        // An older cycle than the vehicle's current one — visible only in the DB,
        // filtered out of the alerts list (matches current cycle rule).
        serviceCycle: Math.max(1, dismissedVehicle.serviceCycle - 1),
        triggeredAt: weeksAgo(6),
        dismissedAt: weeksAgo(5),
        dismissedById: manager.id,
      },
    ],
    skipDuplicates: true,
  });

  // ----------------------------------------------------------- daily reports
  // Backdated daily reports so the manager/admin review screens have history:
  // the fleet manager and each technician file after 5 PM on recent weekdays.
  // reportDate stores the UTC instant of local midnight of the report's day in
  // the author's timezone. The seed fixes the demo zone to Asia/Kolkata
  // (UTC+5:30): its local date rolls over at 18:30Z, so the "local day" of a
  // UTC date is the UTC date + 1 once the UTC clock passes 18:30. We simply
  // generate the last 8 UTC midnights, skip weekends by checking the IST
  // calendar day, and store the IST-local midnight instant for each.
  const istOffsetMs = 5.5 * 60 * 60 * 1000; // Asia/Kolkata (UTC+5:30)

  // The IST calendar day label ("YYYY-MM-DD") of a UTC-midnight instant.
  const istDateKeyOfUtcMidnight = (utcMidnight: Date) => {
    const ist = new Date(utcMidnight.getTime() + istOffsetMs);
    return ist.toISOString().slice(0, 10);
  };
  const istDayOfWeek = (utcMidnight: Date) =>
    new Date(utcMidnight.getTime() + istOffsetMs).getUTCDay();

  // Collect up to 5 recent weekday report dates, ending yesterday (skip today
  // so a fresh seed shows an "open" form — filing today is a live action).
  const reportDays: Date[] = [];
  for (let d = 1; reportDays.length < 5 && d < 12; d++) {
    const utcMidnight = new Date();
    utcMidnight.setUTCDate(utcMidnight.getUTCDate() - d);
    utcMidnight.setUTCHours(0, 0, 0, 0);
    const dow = istDayOfWeek(utcMidnight);
    if (dow !== 0 && dow !== 6) reportDays.push(utcMidnight); // skip weekends
  }

  // The report's reportDate is IST midnight = (UTC midnight of the IST date
  // that this UTC date falls in) - 5.5h. If the UTC date is "2026-09-03", IST
  // midnight of the IST calendar day equal to that UTC date is at
  // 2026-09-02T18:30Z.
  const istLocalMidnightFor = (utcMidnight: Date) => {
    // The IST calendar day for this UTC date is istDateKeyOfUtcMidnight; its
    // local midnight (as a UTC instant) is that date at 18:30Z the day prior.
    const [y, m, day] = istDateKeyOfUtcMidnight(utcMidnight).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day - 1, 18, 30, 0));
  };

  const reportRows: {
    authorId: string;
    type: DailyReportType;
    reportDate: Date;
    createdAt: Date;
    data: Record<string, number | string>;
  }[] = [];

  for (const utcMidnight of reportDays) {
    const reportDate = istLocalMidnightFor(utcMidnight);
    // Filed at ~5:30 PM IST (17:30 IST = 12:00Z) on the same local day.
    const filedAt = new Date(reportDate.getTime() + 17.5 * 60 * 60 * 1000);
    const daysAgoVal = Math.round((Date.now() - reportDate.getTime()) / DAY);

    // The manager files a fleet-level summary.
    reportRows.push({
      authorId: manager.id,
      type: DailyReportType.FLEET_MANAGER,
      reportDate,
      createdAt: filedAt,
      data: {
        bookingsCount: 2 + (daysAgoVal % 3),
        inspectionsCount: 3 + (daysAgoVal % 2),
        notes: `Booked the next round of services and checked in on the bay schedule. ${
          daysAgoVal % 2 === 0
            ? "One van flagged for a brake follow-up."
            : "All technicians cleared their boards."
        }`,
      },
    });

    // Technicians file their hands-on work.
    techs.forEach((tech, ti) => {
      const registrations =
        ti % 2 === 0 ? ["AB12 CDE", "FG34 HIJ"] : ["KL56 MNO", "PQ78 RST"];
      reportRows.push({
        authorId: tech.id,
        type: DailyReportType.TECHNICIAN,
        reportDate,
        createdAt: filedAt,
        data: {
          jobsCompleted: 2 + ((daysAgoVal + ti) % 3),
          hoursWorked: 8,
          registrations: registrations.join("\n"),
          notes:
            ti % 2 === 0
              ? "All good — no issues to flag."
              : "Needed an extra part for the Sprinter.",
        },
      });
    });
  }

  const { count: reportCount } = await prisma.dailyReport.createMany({
    data: reportRows.map((r) => ({
      authorId: r.authorId,
      reportDate: r.reportDate,
      type: r.type,
      createdAt: r.createdAt,
      updatedAt: r.createdAt, // backdated history, like the service records
      jobsCompleted: typeof r.data.jobsCompleted === "number" ? r.data.jobsCompleted : 0,
      hoursWorked: typeof r.data.hoursWorked === "number" ? r.data.hoursWorked : 0,
      registrations:
        typeof r.data.registrations === "string" ? r.data.registrations : "",
      bookingsCount:
        typeof r.data.bookingsCount === "number" ? r.data.bookingsCount : 0,
      inspectionsCount:
        typeof r.data.inspectionsCount === "number" ? r.data.inspectionsCount : 0,
      notes: typeof r.data.notes === "string" ? r.data.notes : "",
    })),
  });
  console.log(`Seeded ${reportCount} daily reports`);

  console.log("\nSeed complete.");
  console.log(`  users: ${users.length}`);
  console.log(`  vehicles: ${vehicles.length}`);
  console.log(`  service records: ${recordCount}`);
  console.log(`  active alerts: ${alertCount}`);
  console.log(`  daily reports: ${reportCount}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
