import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createUserSchema } from "@/lib/validation/user";
import { handleError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";
import type { CreateUserInput } from "@/lib/types";

// GET /api/users — ADMIN only. Lists every non-admin user (fleet managers
// and technicians) with their active-assignment count, so the user-management
// page can show at a glance who is currently working on what before deleting
// anyone.
export async function GET() {
  try {
    await requireRole(Role.ADMIN);

    const users = await prisma.user.findMany({
      where: { role: { not: Role.ADMIN } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            assignments: { where: { unassignedAt: null } },
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(
      users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        activeAssignments: user._count.assignments,
      }))
    );
  } catch (error) {
    return handleError(error);
  }
}

// POST /api/users — ADMIN only. Creates a fleet manager or technician user.
// The role is constrained server-side by the zod schema, so an admin cannot
// mint a new admin through this endpoint (admins are created by seeding).
export async function POST(request: NextRequest) {
  try {
    await requireRole(Role.ADMIN);

    const body: CreateUserInput = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);

    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
      },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
