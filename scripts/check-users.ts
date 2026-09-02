import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DIRECT_URL });
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.user.findMany({
    select: { email: true, role: true, name: true },
    orderBy: { email: "asc" },
  });
  console.log("Users in DB:");
  for (const u of users) console.log(`  ${u.email} -> ${u.role} (${u.name})`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
