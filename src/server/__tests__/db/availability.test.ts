import { beforeEach, expect, it } from "vitest";
import { addMinutes } from "@/lib/dates";
import { getPublicAvailability } from "@/server/data/availability";
import { createBlockedPeriod } from "@/server/data/blocked-periods";
import { createBooking } from "@/server/data/bookings";
import {
  NOW,
  at,
  createResource,
  createSlotOffering,
  createWindowOffering,
  customer,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
} from "@/test/db";

describeDb("getPublicAvailability", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("contains no customer data — only resourceId, startAt, endAt", async () => {
    const villa = await createResource({ name: "Villa" });
    const overnight = await createWindowOffering({ resourceIds: [villa.id], startMinute: 19 * 60, endMinute: 7 * 60, slug: "overnight" });
    await createBooking(
      {
        offering: { id: overnight.id },
        resourceId: villa.id,
        date: "2030-04-06",
        guestCount: 4,
        customer: { name: "Maria Santos", email: "maria@example.com", phone: "0917 123 4567" },
        customerNotes: "Birthday",
        source: "ONLINE",
      },
      { now: NOW },
    );

    const result = await getPublicAvailability({ offeringSlug: "overnight", from: "2030-04-05", to: "2030-04-07" }, { now: NOW });
    const json = JSON.stringify(result);
    for (const secret of ["Maria", "maria@example.com", "0917", "Birthday", "RSV-", "PENDING", "priceBreakdown"]) {
      expect(json).not.toContain(secret);
    }
    for (const option of result!.options) expect(Object.keys(option).sort()).toEqual(["endAt", "resourceId", "startAt"]);
    // The booked night is simply absent.
    expect(result!.options.map((o) => o.startAt.toISOString())).toEqual([
      at("2030-04-05", "19:00").toISOString(),
      at("2030-04-07", "19:00").toISOString(),
    ]);
  });

  it("treats an expired hold as free and respects blocks", async () => {
    const court = await createResource({ name: "Court" });
    await openEveryDay(9 * 60, 12 * 60);
    const offering = await createSlotOffering({ resourceIds: [court.id], durationMin: 60, slug: "court" });
    await createBooking(
      { offering: { id: offering.id }, resourceId: court.id, date: "2030-04-06", startMinute: 9 * 60, guestCount: 2, customer: customer(), source: "ONLINE" },
      { now: NOW },
    );
    await createBlockedPeriod({ resourceId: court.id, startAt: at("2030-04-06", "11:00"), endAt: at("2030-04-06", "12:00") }, { now: NOW });

    const times = async (now: Date) =>
      (await getPublicAvailability({ offeringSlug: "court", from: "2030-04-06", to: "2030-04-06" }, { now }))!.options.map((o) =>
        o.startAt.toISOString(),
      );
    expect(await times(NOW)).toEqual([at("2030-04-06", "10:00").toISOString()]);
    expect(await times(addMinutes(NOW, 16))).toEqual([at("2030-04-06", "09:00").toISOString(), at("2030-04-06", "10:00").toISOString()]);
  });

  it("returns null for an unknown or inactive offering", async () => {
    expect(await getPublicAvailability({ offeringSlug: "nope", from: "2030-04-06", to: "2030-04-06" }, { now: NOW })).toBeNull();
  });
});
