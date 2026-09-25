import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { db, describeDb } from "@/test/db";

describeDb("database schema", () => {
  it("has no drift between the migrations and schema.prisma", () => {
    // --exit-code: 0 = no difference, 2 = difference. Compares the migrated test DB to the schema.
    const run = () =>
      execFileSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], {
        env: { ...process.env, DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL },
        stdio: "pipe",
        shell: process.platform === "win32",
      });
    expect(run).not.toThrow();
  }, 60_000);

  it("computes span as a generated column on bookings and blocked periods", async () => {
    const rows = await db.$queryRaw<Array<{ table_name: string; is_generated: string; generation_expression: string }>>`
      SELECT table_name, is_generated, generation_expression FROM information_schema.columns
      WHERE column_name = 'span' ORDER BY table_name`;
    expect(rows).toEqual([
      { table_name: "blocked_periods", is_generated: "ALWAYS", generation_expression: "tstzrange(start_at, end_at, '[)'::text)" },
      { table_name: "bookings", is_generated: "ALWAYS", generation_expression: "tstzrange(start_at, occupied_until, '[)'::text)" },
    ]);
  });

  it("has the exclusion constraint for active statuses and both guard triggers", async () => {
    const [constraint] = await db.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'bookings_no_overlap'`;
    expect(constraint?.def).toMatch(/EXCLUDE USING gist \(resource_id WITH =, span WITH &&\)/);
    expect(constraint?.def).toMatch(/PENDING_PAYMENT.*CONFIRMED/);

    const triggers = await db.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname`;
    expect(triggers.map((t) => t.tgname)).toEqual(["blocked_periods_guard_bookings", "bookings_guard_blocked"]);
  });
});
