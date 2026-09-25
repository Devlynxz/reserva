import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // "server-only" throws outside a React Server Components bundle; tests import server modules directly.
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DB-backed suites share one database; run files serially so they can't interfere.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/__tests__/**"],
      reporter: ["text-summary", "html"],
      // Domain logic is the part of the app that's cheap to test exhaustively — keep it that way.
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
