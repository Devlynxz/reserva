import { render } from "@react-email/components";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, localDateOf, zonedToUtc } from "@/lib/dates";
import { openCheckout } from "@/server/checkout";
import { createBooking, transitionBooking } from "@/server/data/bookings";
import { BookingConfirmedEmail } from "@/server/email/templates/booking-emails";
import { resetEnvCache } from "@/server/env";
import { bookingLink, notifyBookingConfirmed, notifyBookingReceived, sendDueReminders } from "@/server/notifications";
import { TZ, createResource, createSlotOffering, customer, db, describeDb, openEveryDay, resetDb, seedSettings } from "@/test/db";

// Checkout uses the real clock (holds must be open "now"), so these bookings are made now.
async function setup() {
  await resetDb();
  await seedSettings({ maxAdvanceDays: 365, leadTimeMin: 0 });
  await openEveryDay(0, 1440);
  const court = await createResource({ name: "Court 1" });
  const offering = await createSlotOffering({ resourceIds: [court.id], durationMin: 60, basePrice: "1000" });
  return { courtId: court.id, offeringId: offering.id };
}

const tomorrow = () => addDays(localDateOf(new Date(), TZ), 1);

async function book(ids: { courtId: string; offeringId: string }, source: "ONLINE" | "WALK_IN" = "ONLINE", date = tomorrow(), hour = 10) {
  return createBooking({
    offering: { id: ids.offeringId },
    resourceId: ids.courtId,
    date,
    startMinute: hour * 60,
    guestCount: 2,
    customer: customer(hour),
    source,
  });
}

describeDb("openCheckout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetEnvCache();
  });

  it("does nothing when online payment is off", async () => {
    const ids = await setup();
    const booking = await book(ids);
    await expect(openCheckout(booking.id)).resolves.toEqual({ status: "payments_off" });
  });

  describe("with PayMongo configured", () => {
    beforeEach(() => {
      vi.stubEnv("PAYMENT_PROVIDER", "paymongo");
      vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_x");
      vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "whsk_test_x");
      resetEnvCache();
    });

    it("creates one session, stores it, and reuses it on the next click", async () => {
      const ids = await setup();
      const booking = await book(ids);
      const fetchMock = vi.fn(async () => Response.json({ data: { id: "cs_1", attributes: { checkout_url: "https://pm.example/cs_1" } } }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(openCheckout(booking.id)).resolves.toEqual({ status: "redirect", url: "https://pm.example/cs_1" });
      await expect(openCheckout(booking.id)).resolves.toEqual({ status: "redirect", url: "https://pm.example/cs_1" });
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(row).toMatchObject({ paymentProvider: "PAYMONGO", checkoutSessionId: "cs_1", checkoutUrl: "https://pm.example/cs_1" });
      // The provider gets no access token in its redirect URLs.
      const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
      expect(body.data.attributes.success_url).toMatch(/\/book\/RSV-[A-Z0-9]{5}\?paid=1$/);
    });

    it("two simultaneous Pay clicks end up on the same stored session", async () => {
      const ids = await setup();
      const booking = await book(ids);
      let n = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          const id = `cs_race_${++n}`;
          return Response.json({ data: { id, attributes: { checkout_url: `https://pm.example/${id}` } } });
        }),
      );
      const [a, b] = await Promise.all([openCheckout(booking.id), openCheckout(booking.id)]);
      const stored = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
      expect(a).toEqual({ status: "redirect", url: stored.checkoutUrl });
      expect(b).toEqual({ status: "redirect", url: stored.checkoutUrl });
      expect(stored.checkoutUrl).toBe(`https://pm.example/${stored.checkoutSessionId}`);
    });

    it("releases a new booking's hold when the provider fails", async () => {
      const ids = await setup();
      const booking = await book(ids);
      vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(openCheckout(booking.id, { cancelOnFailure: true })).resolves.toMatchObject({ status: "failed" });
      expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CANCELLED");
    });

    it("refuses currencies the provider can't charge, and non-pending bookings", async () => {
      const ids = await setup();
      await db.settings.update({ where: { id: 1 }, data: { currency: "USD" } });
      const usd = await book(ids);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await expect(openCheckout(usd.id)).resolves.toMatchObject({ status: "failed" });
      expect(fetchMock).not.toHaveBeenCalled();

      const walkIn = await book(ids, "WALK_IN", tomorrow(), 12);
      await expect(openCheckout(walkIn.id)).resolves.toEqual({ status: "not_payable" });
    });
  });
});

describeDb("emails", () => {
  it("renders the confirmation with the reference and a working link", async () => {
    const ids = await setup();
    const booking = await book(ids);
    const link = bookingLink(booking.referenceCode, booking.id);
    expect(link).toBe(`http://localhost:3000/book/${booking.referenceCode}?t=${booking.accessToken}`);

    const html = await render(
      BookingConfirmedEmail({
        brand: { businessName: "Test Resort", brandColor: "#0e7c86", contact: null, address: null },
        brandText: "#ffffff",
        customerName: "Guest",
        referenceCode: booking.referenceCode,
        details: [{ label: "Package", value: "Court hour" }],
        link,
        paid: "₱500.00",
        balance: "₱500.00",
      }),
    );
    expect(html).toContain(booking.referenceCode);
    expect(html).toContain(link.replace(/&/g, "&amp;"));
    expect(html).toContain("You&#x27;re booked");
  });

  it("skips sending (without failing) when Resend isn't configured", async () => {
    const ids = await setup();
    const booking = await book(ids);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(notifyBookingReceived(booking.id)).resolves.toEqual({ status: "skipped" });
    // Wrong status for the email: skipped, not an error.
    await expect(notifyBookingConfirmed(booking.id)).resolves.toEqual({ status: "skipped" });
  });

  it("sends reminders at 09:00 business time for tomorrow's confirmed bookings, once", async () => {
    const ids = await setup();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const today = localDateOf(new Date(), TZ);
    const nineToday = zonedToUtc(today, 9 * 60, TZ);
    const tomorrowDate = addDays(today, 1);

    const confirmed = await book(ids, "WALK_IN", tomorrowDate, 10);
    const pending = await book(ids, "ONLINE", tomorrowDate, 12);
    const dayAfter = await book(ids, "WALK_IN", addDays(today, 2), 10);
    const cancelled = await book(ids, "WALK_IN", tomorrowDate, 14);
    await transitionBooking({ bookingId: cancelled.id, to: "CANCELLED", actor: "staff" });

    await expect(sendDueReminders(zonedToUtc(today, 8 * 60, TZ))).resolves.toMatchObject({ sent: 0, skipped: "not 09:00" });
    await expect(sendDueReminders(nineToday)).resolves.toEqual({ sent: 1, candidates: 1 });
    await expect(sendDueReminders(nineToday)).resolves.toEqual({ sent: 0, candidates: 0 });

    const sentTo = await db.booking.findMany({ where: { reminderSentAt: { not: null } }, select: { id: true } });
    expect(sentTo.map((b) => b.id)).toEqual([confirmed.id]);
    for (const other of [pending, dayAfter, cancelled]) expect(sentTo.some((b) => b.id === other.id)).toBe(false);
  });
});
