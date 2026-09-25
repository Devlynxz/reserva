import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { db, describeDb } from "@/test/db";

function seed(preset: string) {
  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    env: { ...process.env, SEED_PRESET: preset, DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
}

describeDb("seed presets", () => {
  it.each([
    ["resort", 3, ["Day Tour", "Overnight", "22 Hours", "Hall Event"]],
    ["court", 4, ["Court rental (1 hour)"]],
    ["salon", 3, ["Haircut", "Hair color", "Blow-dry & style", "Hair spa", "Keratin treatment"]],
  ] as const)("%s: resources, offerings, one admin + one staff, ~15 bookings", async (preset, resourceCount, offeringNames) => {
    seed(preset);

    expect(await db.resource.count()).toBe(resourceCount);
    expect((await db.offering.findMany({ orderBy: { sortOrder: "asc" } })).map((o) => o.name)).toEqual(offeringNames);
    expect(await db.user.findMany({ select: { role: true }, orderBy: { role: "asc" } })).toEqual([{ role: "ADMIN" }, { role: "STAFF" }]);
    expect(await db.account.count({ where: { providerId: "credential", password: { not: null } } })).toBe(2);

    const bookings = await db.booking.findMany({ include: { events: { orderBy: { createdAt: "asc" } }, payments: true } });
    expect(bookings.length).toBe(15);
    for (const b of bookings) {
      // Every booking's last event matches its status, and money adds up.
      expect(b.events.at(-1)?.toStatus).toBe(b.status);
      expect(b.events[0]?.fromStatus).toBeNull();
      const paid = b.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      expect(Number(b.amountPaid)).toBeCloseTo(paid, 2);
      expect(Number(b.amountPaid)).toBeLessThanOrEqual(Number(b.totalAmount));
    }
  }, 120_000);

  it("resort: Holy Week override is in the future", async () => {
    seed("resort");
    const [holyWeek] = await db.pricingOverride.findMany();
    expect(holyWeek?.label).toBe("Holy Week");
    expect(holyWeek!.endDate.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
    expect(holyWeek!.multiplier?.toString()).toBe("1.5");
  }, 120_000);
});
