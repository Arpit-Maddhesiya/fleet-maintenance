import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";
import type { Prisma, User } from "@/generated/prisma/client";

// GET /api/search?q=... — universal search backing the command palette
// (Ctrl+K). Any authenticated user. Returns grouped results:
//   vehicles, serviceRecords, technicians, managers
// A TECHNICIAN caller is scoped to records they're actively assigned to and
// never sees manager accounts or fleet vehicles (they have no vehicles page);
// a manager sees all non-archived vehicles and all records. ADMINS and
// FLEET_MANAGERs are visible only to managers/admins, because technicians
// have no reason to browse management accounts.

const SEARCH_LIMIT = 6;

// The route needs a discriminated people result; keep the filter inline so the
// `people.filter` stays narrow and type-stable.
type PeopleRow = Pick<User, "id" | "name" | "email" | "role">;

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be signed in." },
        { status: 401 }
      );
    }

    const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
    if (!q) {
      return NextResponse.json({
        vehicles: [],
        serviceRecords: [],
        technicians: [],
        managers: [],
      });
    }

    const isManager = session.user.role === Role.FLEET_MANAGER || session.user.role === Role.ADMIN;
    const contains: Prisma.StringFilter = { contains: q, mode: "insensitive" };

    const [vehicles, serviceRecords, people] = await Promise.all([
      // Vehicles are a manager/admin concern — technicians have no vehicles
      // pages, so skip the query entirely for them.
      isManager
        ? prisma.vehicle.findMany({
            where: {
              archivedAt: null,
              OR: [
                { registrationNumber: contains },
                { make: contains },
                { model: contains },
              ],
            },
            select: {
              id: true,
              registrationNumber: true,
              make: true,
              model: true,
              currentOdometer: true,
              archivedAt: true,
            },
            orderBy: { registrationNumber: "asc" },
            take: SEARCH_LIMIT,
          })
        : Promise.resolve([]),
      // Technicians only ever see their own active assignments; managers see
      // every record (same rule as the list endpoint).
      prisma.serviceRecord.findMany({
        where: {
          ...(isManager
            ? {}
            : {
                assignments: {
                  some: { technicianId: session.user.id, unassignedAt: null },
                },
              }),
          description: contains,
        },
        select: {
          id: true,
          description: true,
          status: true,
          vehicle: { select: { registrationNumber: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: SEARCH_LIMIT,
      }),
      // People search (technicians/managers) is for managers and admins — a
      // manager may want to find a technician to assign. Technicians only get
      // their own scoped service records, so skip people entirely for them.
      isManager
        ? prisma.user.findMany({
            where: {
              OR: [{ name: contains }, { email: contains }],
            },
            select: { id: true, name: true, email: true, role: true },
            orderBy: { name: "asc" },
            take: SEARCH_LIMIT,
          })
        : Promise.resolve([]),
    ]);

    const technicians = people.filter(
      (p): p is PeopleRow & { role: "TECHNICIAN" } =>
        p.role === Role.TECHNICIAN
    );
    const managers = people.filter(
      (
        p
      ): p is PeopleRow & { role: "ADMIN" | "FLEET_MANAGER" } =>
        p.role === Role.FLEET_MANAGER || p.role === Role.ADMIN
    );

    return NextResponse.json({
      vehicles,
      serviceRecords,
      technicians,
      managers,
    });
  } catch (error) {
    return handleError(error);
  }
}
