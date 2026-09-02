import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as listUsers, POST as createUser } from "@/app/api/users/route";
import { DELETE as deleteUser } from "@/app/api/users/[id]/route";
import { requireRole, ForbiddenError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

// Route handlers are typed against the real NextRequest, but under Vitest the
// handlers run against a plain Request — the handlers only read the body.
const asNextRequest = (req: Request) => req as unknown as NextRequest;

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireRole: vi.fn(),
  };
});

vi.mock("@/lib/db", () => {
  const user = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  };
  return { prisma: { user } };
});

const adminSession = { user: { id: "u-admin", role: "ADMIN" } };

const seededUsers = [
  {
    id: "u1",
    name: "Fleet Manager",
    email: "manager@fleet.test",
    role: "FLEET_MANAGER",
    createdAt: new Date("2026-09-01"),
    _count: { assignments: 0 },
  },
  {
    id: "u2",
    name: "Technician One",
    email: "tech1@fleet.test",
    role: "TECHNICIAN",
    createdAt: new Date("2026-09-01"),
    _count: { assignments: 2 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(adminSession as never);
});

describe("GET /api/users", () => {
  it("lists non-admin users with their active-assignment counts", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue(seededUsers as never);

    const res = await listUsers();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      id: "u1",
      name: "Fleet Manager",
      email: "manager@fleet.test",
      role: "FLEET_MANAGER",
      createdAt: expect.any(String),
      activeAssignments: 0,
    });
    expect(body[1].activeAssignments).toBe(2);
    // The query must exclude admins — the user list is for managing
    // managers/technicians, never for editing the admin pool.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { not: "ADMIN" } },
      })
    );
  });

  it("requires the ADMIN role (403 for a fleet manager)", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires one of the following roles: ADMIN.",
        ["ADMIN"]
      )
    );

    const res = await listUsers();

    expect(res.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/users", () => {
  const validBody = {
    name: "New Technician",
    email: "tech3@fleet.test",
    password: "password123",
    role: "TECHNICIAN",
  };

  it("creates a technician user with a bcrypt-hashed password", async () => {
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u3",
      name: "New Technician",
      email: "tech3@fleet.test",
      role: "TECHNICIAN",
    } as never);

    const res = await createUser(
      asNextRequest(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify(validBody),
        })
      )
    );

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: "New Technician",
        email: "tech3@fleet.test",
        role: "TECHNICIAN",
        passwordHash: expect.stringMatching(/^\$2[aby]\$\d+\$/),
      },
      select: { id: true, name: true, email: true, role: true },
    });
  });

  it("creates a fleet manager user", async () => {
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u4",
      name: "New Manager",
      email: "manager2@fleet.test",
      role: "FLEET_MANAGER",
    } as never);

    const res = await createUser(
      asNextRequest(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({
            ...validBody,
            name: "New Manager",
            email: "manager2@fleet.test",
            role: "FLEET_MANAGER",
          }),
        })
      )
    );

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "FLEET_MANAGER" }),
      })
    );
  });

  it("rejects an attempt to create an ADMIN user (schema boundary)", async () => {
    const res = await createUser(
      asNextRequest(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({ ...validBody, role: "ADMIN" }),
        })
      )
    );

    expect(res.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input (short password, bad email, empty name)", async () => {
    const res = await createUser(
      asNextRequest(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify({
            name: "",
            email: "not-an-email",
            password: "short",
            role: "TECHNICIAN",
          }),
        })
      )
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.fieldErrors.name).toBeDefined();
    expect(body.details.fieldErrors.email).toBeDefined();
    expect(body.details.fieldErrors.password).toBeDefined();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("requires the ADMIN role", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires one of the following roles: ADMIN.",
        ["ADMIN"]
      )
    );

    const res = await createUser(
      asNextRequest(
        new Request("http://localhost/api/users", {
          method: "POST",
          body: JSON.stringify(validBody),
        })
      )
    );

    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/users/[id]", () => {
  const params = { params: Promise.resolve({ id: "u-tech1" }) };

  it("deletes a technician with no active assignments", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-tech1",
      role: "TECHNICIAN",
      _count: { assignments: 0 },
    } as never);

    const res = await deleteUser(
      asNextRequest(new Request("http://localhost/api/users/u-tech1", { method: "DELETE" })),
      params
    );

    expect(res.status).toBe(200);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u-tech1" } });
  });

  it("refuses to delete a user with active assignments (409)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-tech1",
      role: "TECHNICIAN",
      _count: { assignments: 1 },
    } as never);

    const res = await deleteUser(
      asNextRequest(new Request("http://localhost/api/users/u-tech1", { method: "DELETE" })),
      params
    );

    expect(res.status).toBe(409);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete an ADMIN (403)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u-admin2",
      role: "ADMIN",
      _count: { assignments: 0 },
    } as never);

    const res = await deleteUser(
      asNextRequest(new Request("http://localhost/api/users/u-admin2", { method: "DELETE" })),
      { params: Promise.resolve({ id: "u-admin2" }) }
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Admins cannot be deleted.");
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);

    const res = await deleteUser(
      asNextRequest(new Request("http://localhost/api/users/nope", { method: "DELETE" })),
      { params: Promise.resolve({ id: "nope" }) }
    );

    expect(res.status).toBe(404);
  });

  it("requires the ADMIN role", async () => {
    vi.mocked(requireRole).mockRejectedValue(
      new ForbiddenError(
        "This action requires one of the following roles: ADMIN.",
        ["ADMIN"]
      )
    );

    const res = await deleteUser(
      asNextRequest(new Request("http://localhost/api/users/u-tech1", { method: "DELETE" })),
      params
    );

    expect(res.status).toBe(403);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});
