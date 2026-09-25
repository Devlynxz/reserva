import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ quiet: true });

// Database suites run ONLY against TEST_DATABASE_URL (they truncate tables), and are
// skipped when it isn't set. DATABASE_URL is overridden so no test can reach the dev
// or production database by accident.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

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
    env: {
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_UNPOOLED: testDatabaseUrl,
      // Auth needs these to boot; tests never use a real deployment's secret.
      BETTER_AUTH_SECRET: "test-only-secret-not-used-anywhere-else-000",
      BETTER_AUTH_URL: "http://localhost:3000",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    },
    globalSetup: ["./src/test/global-setup.ts"],
    // DB-backed suites share one database; run files serially so they can't interfere.
    fileParallelism: false,
    hookTimeout: 60_000,
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
