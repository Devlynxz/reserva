import { beforeEach, expect, it } from "vitest";
import { TransitionError } from "@/lib/booking-status";
import { addMinutes } from "@/lib/dates";
import { createBooking, expireStaleHolds, transitionBooking } from "@/server/data/bookings";
import { BookingConflictError, BookingNotFoundError } from "@/server/data/errors";
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

describeDb("transitionBooking", () => {
  let courtId: string;
  let offeringId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    await openEveryDay();
    courtId = (await createResource({ name: "Court 1" })).id;
    offeringId = (await createSlotOffering({ resourceIds: [courtId], durationMin: 60 })).id;
  });

  const book = (n: number, now = NOW) =>
    createBooking(
      {
        offering: { id: offeringId },
        resourceId: courtId,
        date: "2030-04-06",
        startMinute: 10 * 60,
        guestCount: 2,
        customer: customer(n),
        source: "ONLINE",
      },
      { now },
    );

  it("confirms a pending booking, clears the hold and records the event", async () => {
    const booking = await book(1);
    await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: "webhook", note: "Paid via GCash", now: NOW });
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { events: { orderBy: { createdAt: "asc" } } } });
    expect(row).toMatchObject({ status: "CONFIRMED", holdExpiresAt: null });
    expect(row.events.at(-1)).toMatchObject({ fromStatus: "PENDING_PAYMENT", toStatus: "CONFIRMED", note: "Paid via GCash" });
  });

  it("refuses transitions the state machine doesn't allow, without writing anything", async () => {
    const booking = await book(1);
    await expect(transitionBooking({ bookingId: booking.id, to: "COMPLETED", actor: "staff", now: NOW })).rejects.toBeInstanceOf(
      TransitionError,
    );
    await expect(transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: "customer", now: NOW })).rejects.toBeInstanceOf(
      TransitionError,
    );
    expect(await db.bookingEvent.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it("only completes a booking once it has started", async () => {
    const booking = await book(1);
    await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: "webhook", now: NOW });
    await expect(
      transitionBooking({ bookingId: booking.id, to: "COMPLETED", actor: "staff", now: at("2030-04-06", "09:59") }),
    ).rejects.toMatchObject({ code: "not_started" });
    await transitionBooking({ bookingId: booking.id, to: "COMPLETED", actor: "staff", now: at("2030-04-06", "10:00") });
  });

  it("late payment: re-confirms an expired booking when the slot is still free", async () => {
    const booking = await book(1);
    await db.booking.update({ where: { id: booking.id }, data: { holdExpiresAt: addMinutes(NOW, -1) } });
    await db.$transaction((tx) => expireStaleHolds(tx, { now: NOW }));
    await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: "webhook", now: NOW });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
  });

  it("late payment: refused (slot kept by the new guest) when someone else took the slot", async () => {
    const first = await book(1);
    const second = await book(2, addMinutes(NOW, 16)); // first's hold expired; second takes the slot
    await expect(transitionBooking({ bookingId: first.id, to: "CONFIRMED", actor: "webhook", now: addMinutes(NOW, 17) })).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    expect((await db.booking.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("EXPIRED");
    expect((await db.booking.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("reports a missing booking", async () => {
    await expect(
      transitionBooking({ bookingId: "0196b0c4-7a2e-7cc1-9a5e-2f4b8c1d3e5f", to: "CONFIRMED", actor: "webhook" }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });
});
