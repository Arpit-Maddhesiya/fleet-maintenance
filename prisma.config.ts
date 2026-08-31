import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    // Prisma Migrate (CLI) uses the direct connection; the app itself uses the
    // pooled DATABASE_URL via the Neon adapter in src/lib/db.ts.
    url: env("DIRECT_URL"),
  },
});
