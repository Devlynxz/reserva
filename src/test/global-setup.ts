import { execFileSync } from "node:child_process";

/** Bring the test database up to the latest migration once per run (no-op without one). */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.info("TEST_DATABASE_URL not set: database suites will be skipped.");
    return;
  }
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  });
}
