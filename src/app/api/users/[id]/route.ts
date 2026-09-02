import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleError, NotFoundError } from "@/lib/api";
import { Role } from "@/generated/prisma/enums";

// DELETE /api/users/[id] — ADMIN only. Removes a fleet manager or technician.
// Safeguards: admins themselves can never be deleted through this endpoint,
// and a user with an active service assignment is refused until those
// assignments are unassigned (so no record is orphaned or silently loses its
// technician).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(Role.ADMIN);

    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        _count: {
          select: {
            assignments: { where: { unassignedAt: null } },
          },
        },
      },
    });
    if (!user) throw new NotFoundError("User not found.");

    if (user.role === Role.ADMIN) {
      return NextResponse.json(
        { error: "Admins cannot be deleted." },
        { status: 403 }
      );
    }
    if (user._count.assignments > 0) {
      return NextResponse.json(
        {
          error:
            "This user still has active service assignments. Unassign them first.",
        },
        { status: 409 }
      );
    }

    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
