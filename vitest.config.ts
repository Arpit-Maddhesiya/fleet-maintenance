import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Next.js 16 has no resolvable `next/server` entry in a plain Node
      // environment (next-auth imports it), so route handlers get a stub.
      "next/server": path.resolve(__dirname, "src/test/next-server-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    server: {
      deps: {
        // next-auth is pure ESM and would otherwise be loaded natively,
        // bypassing Vite's resolver — which means its `import "next/server"`
        // fails (Next 16 has no such export entry). Inlining it routes it
        // through Vite, where the `next/server` alias applies.
        inline: [/next-auth/, /@auth\/core/],
      },
    },
  },
});
