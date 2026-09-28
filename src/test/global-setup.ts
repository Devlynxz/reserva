import { execFileSync } from "node:child_process";
import pg from "pg";

/** Bring the test database up to the latest migration once per run (no-op without one). */
export default async function setup(): Promise<void> {
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

  // Run the test database in a non-UTC time zone on every machine, so the suites prove the
  // app pins its own connections to UTC instead of relying on the server's default.
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string }>("SELECT current_database() AS name");
    await client.query(`ALTER DATABASE ${client.escapeIdentifier(rows[0]!.name)} SET timezone TO 'Asia/Manila'`);
  } finally {
    await client.end();
  }
}
