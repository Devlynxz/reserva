import { beforeEach, expect, it } from "vitest";
import { addMinutes } from "@/lib/dates";
import { createBlockedPeriod } from "@/server/data/blocked-periods";
import { createBooking } from "@/server/data/bookings";
import { BlockConflictError, BookingConflictError } from "@/server/data/errors";
import {
  NOW,
  at,
  createResource,
  createSlotOffering,
  customer,
  db,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
} from "@/test/db";

describeDb("blocked periods", () => {
  let courtId: string;
  let otherCourtId: string;
  let offeringId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    await openEveryDay();
    courtId = (await createResource({ name: "Court 1", sortOrder: 1 })).id;
    otherCourtId = (await createResource({ name: "Court 2", sortOrder: 2 })).id;
    offeringId = (await createSlotOffering({ resourceIds: [courtId, otherCourtId], durationMin: 60 })).id;
  });

  const book = (resourceId: string, hour: number, now = NOW) =>
    createBooking(
      {
        offering: { id: offeringId },
        resourceId,
        date: "2030-04-06",
        startMinute: hour * 60,
        guestCount: 2,
        customer: customer(),
        source: "ONLINE",
      },
      { now },
    );

  it("a booking inside a block is refused as 'blocked'", async () => {
    await createBlockedPeriod({ resourceId: courtId, startAt: at("2030-04-06", "09:00"), endAt: at("2030-04-06", "12:00") }, { now: NOW });
    await expect(book(courtId, 10)).rejects.toSatisfy((e) => e instanceof BookingConflictError && e.reason === "blocked");
    // The other court is unaffected, and "any" skips the blocked one.
    await expect(book(otherCourtId, 10)).resolves.toBeDefined();
    await expect(book(courtId, 12)).resolves.toBeDefined(); // block ends 12:00
  });

  it("a business-wide block closes every resource", async () => {
    await createBlockedPeriod({ resourceId: null, startAt: at("2030-04-06", "00:00"), endAt: at("2030-04-07", "00:00"), reason: "Typhoon" }, { now: NOW });
    await expect(book("any", 10)).rejects.toSatisfy((e) => e instanceof BookingConflictError && e.reason === "blocked");
  });

  it("the trigger rejects a booking inserted straight into a block (no app checks)", async () => {
    await createBlockedPeriod({ resourceId: courtId, startAt: at("2030-04-06", "09:00"), endAt: at("2030-04-06", "12:00") }, { now: NOW });
    const error = await db.booking
      .create({
        data: {
          referenceCode: "RSV-BLKD2",
          accessTokenHash: "blocked",
          resourceId: courtId,
          offeringId,
          startAt: at("2030-04-06", "10:00"),
          endAt: at("2030-04-06", "11:00"),
          occupiedUntil: at("2030-04-06", "11:00"),
          customerName: "x",
          customerEmail: "x@example.com",
          totalAmount: "1",
          depositAmount: "1",
          currency: "PHP",
          priceBreakdown: {},
          status: "CONFIRMED",
          source: "WALK_IN",
        },
      })
      .catch((e: unknown) => e);
    expect(JSON.stringify(error)).toContain("bookings_blocked_period");
  });

  it("a block over an active booking is refused; over an expired hold it's fine", async () => {
    await book(courtId, 10);
    const block = { resourceId: courtId, startAt: at("2030-04-06", "08:00"), endAt: at("2030-04-06", "18:00") };
    await expect(createBlockedPeriod(block, { now: NOW })).rejects.toBeInstanceOf(BlockConflictError);
    await expect(createBlockedPeriod({ ...block, resourceId: null }, { now: NOW })).rejects.toBeInstanceOf(BlockConflictError);

    // 20 minutes later the checkout was abandoned: its hold expires and the block goes in.
    await expect(createBlockedPeriod(block, { now: addMinutes(NOW, 20) })).resolves.toMatchObject({ resourceId: courtId });
  });

  it("a booking and a block racing for the same time: exactly one wins", async () => {
    for (let round = 0; round < 10; round++) {
      await db.bookingEvent.deleteMany();
      await db.booking.deleteMany();
      await db.blockedPeriod.deleteMany();
      const [booking, block] = await Promise.allSettled([
        book(courtId, 10),
        createBlockedPeriod({ resourceId: courtId, startAt: at("2030-04-06", "10:00"), endAt: at("2030-04-06", "11:00") }, { now: NOW }),
      ]);
      const wins = [booking, block].filter((r) => r.status === "fulfilled");
      expect(wins, `round ${round}`).toHaveLength(1);
      const loser = [booking, block].find((r): r is PromiseRejectedResult => r.status === "rejected")!;
      expect(loser.reason instanceof BookingConflictError || loser.reason instanceof BlockConflictError).toBe(true);
    }
  }, 60_000);
});
