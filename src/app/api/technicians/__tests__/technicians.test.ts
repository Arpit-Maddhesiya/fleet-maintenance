import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as listTechnicians } from "@/app/api/technicians/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    requireRole: vi.fn(),
    auth: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

const managerSession = { user: { id: "u-manager", role: "FLEET_MANAGER" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue(managerSession as never);
});

describe("GET /api/technicians", () => {
  it("returns technicians ordered by name", async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u-tech2", name: "Bob Tech" },
      { id: "u-tech1", name: "Alice Tech" },
    ] as never);

    const res = await listTechnicians();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { id: "u-tech2", name: "Bob Tech" },
      { id: "u-tech1", name: "Alice Tech" },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: "TECHNICIAN" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("rejects an unauthenticated caller with 401", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await listTechnicians();

    expect(res.status).toBe(401);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
