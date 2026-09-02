import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";
import { Role } from "@/generated/prisma/enums";

async function main() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await bcrypt.hash("password123", 10);

  const users = [
    {
      email: "admin@fleet.test",
      name: "Administrator",
      role: Role.ADMIN,
    },
    {
      email: "manager@fleet.test",
      name: "Fleet Manager",
      role: Role.FLEET_MANAGER,
    },
    {
      email: "tech1@fleet.test",
      name: "Technician One",
      role: Role.TECHNICIAN,
    },
    {
      email: "tech2@fleet.test",
      name: "Technician Two",
      role: Role.TECHNICIAN,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role, name: user.name },
      create: { ...user, passwordHash },
    });
    console.log(`Seeded user ${user.email} (${user.role})`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
