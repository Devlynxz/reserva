import { beforeEach, expect, it } from "vitest";
import { addMinutes } from "@/lib/dates";
import { createBooking, sweepExpiredHolds } from "@/server/data/bookings";
import { BookingConflictError, BookingInputError, isExclusionViolation } from "@/server/data/errors";
import { hashAccessToken } from "@/server/tokens";
import {
  NOW,
  at,
  createResource,
  createSlotOffering,
  createWindowOffering,
  customer,
  db,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
} from "@/test/db";

const H = (h: number, m = 0) => h * 60 + m;

describeDb("createBooking", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  async function court(bufferMin = 0) {
    const resource = await createResource({ name: "Court 1" });
    await openEveryDay();
    const offering = await createSlotOffering({ resourceIds: [resource.id], durationMin: 60, bufferMin });
    return { resource, offering };
  }

  const slotRequest = (offeringId: string, resourceId: string, startMinute: number, n = 1) => ({
    offering: { id: offeringId },
    resourceId,
    date: "2030-04-06",
    startMinute,
    guestCount: 2,
    customer: customer(n),
    source: "ONLINE" as const,
  });

  it("20 concurrent requests for one slot: exactly one wins", async () => {
    const { resource, offering } = await court();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => createBooking(slotRequest(offering.id, resource.id, H(10), i), { now: NOW })),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(19);
    for (const loss of lost) expect(loss.reason).toBeInstanceOf(BookingConflictError);
    expect(await db.booking.count({ where: { status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } })).toBe(1);
  }, 60_000);

  it("the exclusion constraint alone stops overlapping inserts (no app locks involved)", async () => {
    const { resource, offering } = await court();
    const row = (i: number) => ({
      referenceCode: `RSV-RAW${String(i).padStart(2, "0")}`.slice(0, 9),
      accessTokenHash: `raw-${i}`,
      resourceId: resource.id,
      offeringId: offering.id,
      // Staggered but overlapping: every pair collides.
      startAt: addMinutes(at("2030-04-06", "10:00"), i),
      endAt: addMinutes(at("2030-04-06", "11:00"), i),
      occupiedUntil: addMinutes(at("2030-04-06", "11:00"), i),
      customerName: "x",
      customerEmail: "x@example.com",
      totalAmount: "1",
      depositAmount: "1",
      currency: "PHP",
      priceBreakdown: {},
      status: "CONFIRMED" as const,
      source: "WALK_IN" as const,
    });
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => db.booking.create({ data: row(i) })));
    const lost = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const loss of lost) expect(isExclusionViolation(loss.reason, "bookings_no_overlap")).toBe(true);
  }, 60_000);

  it('"any staff": concurrent requests spread across free stylists, extras are refused', async () => {
    const stylists = await Promise.all(
      ["Ana", "Ben", "Cris"].map((name, i) => createResource({ name, type: "STAFF", sortOrder: i })),
    );
    await openEveryDay();
    const haircut = await createSlotOffering({ resourceIds: stylists.map((s) => s.id), durationMin: 45, slotStepMin: 15 });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => createBooking(slotRequest(haircut.id, "any", H(10), i), { now: NOW })),
    );
    const won = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    expect(won).toHaveLength(3);
    expect(new Set(won.map((b) => b.resourceId))).toEqual(new Set(stylists.map((s) => s.id)));
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(BookingConflictError);
  }, 60_000);

  it('"any staff" prefers resources by sort order', async () => {
    const later = await createResource({ name: "Zed", type: "STAFF", sortOrder: 5 });
    const first = await createResource({ name: "Ana", type: "STAFF", sortOrder: 1 });
    await openEveryDay();
    const offering = await createSlotOffering({ resourceIds: [later.id, first.id], durationMin: 60 });
    const booking = await createBooking(slotRequest(offering.id, "any", H(9)), { now: NOW });
    expect(booking.resourceId).toBe(first.id);
  });

  it("a Day Tour and the Overnight after it share a villa; a 22-hour stay doesn't fit", async () => {
    const villa = await createResource({ name: "Main Pool Villa" });
    const cleaning = { resourceIds: [villa.id], bufferMin: 60 };
    const dayTour = await createWindowOffering({ ...cleaning, startMinute: H(8), endMinute: H(17) });
    const overnight = await createWindowOffering({ ...cleaning, startMinute: H(19), endMinute: H(7) });
    const twentyTwo = await createWindowOffering({ ...cleaning, startMinute: H(14), endMinute: H(12) });
    const windowRequest = (offeringId: string, date: string) => ({
      offering: { id: offeringId },
      resourceId: villa.id,
      date,
      guestCount: 10,
      customer: customer(),
      source: "ONLINE" as const,
    });

    await createBooking(windowRequest(dayTour.id, "2030-04-06"), { now: NOW });
    await createBooking(windowRequest(overnight.id, "2030-04-06"), { now: NOW });
    await createBooking(windowRequest(dayTour.id, "2030-04-07"), { now: NOW }); // starts 08:00, right after cleaning
    await expect(createBooking(windowRequest(twentyTwo.id, "2030-04-07"), { now: NOW })).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    await expect(createBooking(windowRequest(twentyTwo.id, "2030-04-08"), { now: NOW })).resolves.toMatchObject({
      status: "PENDING_PAYMENT",
    });
  });

  it("the turnover buffer is enforced by the database, not just the app", async () => {
    const { resource, offering } = await court(30);
    await createBooking(slotRequest(offering.id, resource.id, H(10)), { now: NOW }); // occupies 10:00–11:30
    await expect(createBooking(slotRequest(offering.id, resource.id, H(11)), { now: NOW })).rejects.toBeInstanceOf(
      BookingConflictError,
    );

    // Bypass the app: a raw insert inside the buffer still hits the exclusion constraint.
    const error = await db.booking
      .create({
        data: {
          referenceCode: "RSV-BUFF2",
          accessTokenHash: "buffer",
          resourceId: resource.id,
          offeringId: offering.id,
          startAt: at("2030-04-06", "11:15"),
          endAt: at("2030-04-06", "12:15"),
          occupiedUntil: at("2030-04-06", "12:15"),
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
    expect(isExclusionViolation(error, "bookings_no_overlap")).toBe(true);

    await expect(createBooking(slotRequest(offering.id, resource.id, H(12)), { now: NOW })).resolves.toBeDefined();
  });

  it("an expired hold frees the slot (lazily, with an EXPIRED event)", async () => {
    const { resource, offering } = await court();
    const first = await createBooking(slotRequest(offering.id, resource.id, H(10), 1), { now: NOW });
    expect(first.holdExpiresAt).toEqual(addMinutes(NOW, 15));

    await expect(
      createBooking(slotRequest(offering.id, resource.id, H(10), 2), { now: addMinutes(NOW, 14) }),
    ).rejects.toBeInstanceOf(BookingConflictError);

    const second = await createBooking(slotRequest(offering.id, resource.id, H(10), 2), { now: addMinutes(NOW, 15) });
    expect(second.status).toBe("PENDING_PAYMENT");

    const expired = await db.booking.findUniqueOrThrow({ where: { id: first.id }, include: { events: true } });
    expect(expired.status).toBe("EXPIRED");
    expect(expired.events.map((e) => [e.fromStatus, e.toStatus])).toEqual([
      [null, "PENDING_PAYMENT"],
      ["PENDING_PAYMENT", "EXPIRED"],
    ]);
  });

  it("the scheduled sweep expires every stale hold exactly once", async () => {
    const { resource, offering } = await court();
    await createBooking(slotRequest(offering.id, resource.id, H(9)), { now: NOW });
    await createBooking(slotRequest(offering.id, resource.id, H(10)), { now: NOW });
    await createBooking(slotRequest(offering.id, resource.id, H(11)), { now: addMinutes(NOW, 10) });

    const later = addMinutes(NOW, 20);
    const counts = await Promise.all([sweepExpiredHolds(later), sweepExpiredHolds(later)]);
    expect(counts.toSorted()).toEqual([0, 2]);
    expect(await db.bookingEvent.count({ where: { toStatus: "EXPIRED" } })).toBe(2);
    expect(await db.booking.count({ where: { status: "PENDING_PAYMENT" } })).toBe(1);
  });

  it("stores the priced snapshot, a hashed access token and the first event", async () => {
    const { resource, offering } = await court();
    const booking = await createBooking(slotRequest(offering.id, resource.id, H(10)), { now: NOW });
    expect(booking.referenceCode).toMatch(/^RSV-[2-9A-HJKMNP-Z]{5}$/);
    expect(booking).toMatchObject({ totalAmount: "500.00", depositAmount: "250.00", currency: "PHP" });

    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { events: true } });
    expect(row.accessTokenHash).toBe(hashAccessToken(booking.accessToken));
    expect(row.accessTokenHash).not.toContain(booking.accessToken);
    expect(row.priceBreakdown).toMatchObject({ total: "500.00", deposit: "250.00", currency: "PHP" });
    expect(row.events).toHaveLength(1);
    expect(row.events[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING_PAYMENT", note: "Created (online)" });
  });

  it("staff walk-ins are confirmed; 'awaiting payment' message bookings hold nothing", async () => {
    const { resource, offering } = await court();
    const walkIn = await createBooking({ ...slotRequest(offering.id, resource.id, H(9)), source: "WALK_IN" }, { now: NOW });
    expect(walkIn).toMatchObject({ status: "CONFIRMED", holdExpiresAt: null });

    const message = await createBooking(
      { ...slotRequest(offering.id, resource.id, H(10)), source: "MESSAGE", awaitingPayment: true },
      { now: NOW },
    );
    expect(message).toMatchObject({ status: "PENDING_PAYMENT", holdExpiresAt: null });
    // A no-hold pending booking never expires.
    expect(await sweepExpiredHolds(addMinutes(NOW, 60 * 24 * 7))).toBe(0);
  });

  it("refuses requests that don't describe a bookable option", async () => {
    const { resource, offering } = await court();
    const other = await createResource({ name: "Court 9" });
    const cases: Array<[Parameters<typeof createBooking>[0], string]> = [
      [{ ...slotRequest(offering.id, resource.id, H(10)), offering: { slug: "missing" } }, "offering_not_found"],
      [slotRequest(offering.id, other.id, H(10)), "resource_not_offered"],
      [{ ...slotRequest(offering.id, resource.id, H(10)), startMinute: undefined }, "invalid_time"],
      [slotRequest(offering.id, resource.id, H(10, 30)), "invalid_time"], // off the hourly grid
      [slotRequest(offering.id, resource.id, H(22)), "invalid_time"], // after closing
      [{ ...slotRequest(offering.id, resource.id, H(10)), guestCount: 9 }, "invalid_guests"],
      [{ ...slotRequest(offering.id, resource.id, H(10)), date: "2031-06-01" }, "outside_booking_window"],
    ];
    for (const [request, code] of cases) {
      await expect(createBooking(request, { now: NOW })).rejects.toSatisfy(
        (e) => e instanceof BookingInputError && e.code === code,
      );
    }
    expect(await db.booking.count()).toBe(0);
  });

  it("staff may book outside the online horizon", async () => {
    const { resource, offering } = await court();
    const past = await createBooking(
      { ...slotRequest(offering.id, resource.id, H(10)), date: "2030-03-01", source: "WALK_IN" },
      { now: NOW },
    );
    expect(past.status).toBe("CONFIRMED");
  });
});
