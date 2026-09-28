import { beforeEach, expect, it } from "vitest";
import { db, describeDb, resetDb } from "@/test/db";

// The pg driver adapter treats every timestamptz it reads as UTC, so a connection whose
// session time zone isn't UTC shifts every stored instant by that offset. The test
// database runs in Asia/Manila (src/test/global-setup.ts) to keep this honest.

describeDb("database time zone", () => {
  beforeEach(resetDb);

  it("runs every app connection in UTC", async () => {
    const [row] = await db.$queryRaw<Array<{ tz: string }>>`SELECT current_setting('TimeZone') AS tz`;
    expect(row?.tz).toBe("UTC");
  });

  it("stores the instant the app wrote, as the database itself sees it", async () => {
    const instant = new Date("2030-04-06T02:00:00.000Z");
    await db.rateLimit.create({ data: { key: "tz-probe", count: 1, windowStart: instant } });

    const [row] = await db.$queryRaw<Array<{ ms: number }>>`
      SELECT (extract(epoch FROM window_start) * 1000)::float8 AS ms FROM rate_limits WHERE key = 'tz-probe'`;
    expect(row?.ms).toBe(instant.getTime());
    expect((await db.rateLimit.findUnique({ where: { key: "tz-probe" } }))?.windowStart.toISOString()).toBe(instant.toISOString());
  });

  it("agrees with database-generated times", async () => {
    // A column the database fills in itself (DEFAULT CURRENT_TIMESTAMP) must read back as now.
    await db.$executeRaw`INSERT INTO rate_limits (key, count, window_start) VALUES ('tz-now', 1, now())`;
    const saved = await db.rateLimit.findUnique({ where: { key: "tz-now" } });
    expect(Math.abs(saved!.windowStart.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
