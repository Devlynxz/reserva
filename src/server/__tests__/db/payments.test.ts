import { NextRequest } from "next/server";
import Stripe from "stripe";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { addMinutes } from "@/lib/dates";
import { createBooking, sweepExpiredHolds } from "@/server/data/bookings";
import { resetEnvCache } from "@/server/env";
import { recordProviderPayment } from "@/server/data/payments";
import { paymongoSignature } from "@/server/payments/paymongo";
import type { PaymentEvent } from "@/server/payments/provider";
import {
  NOW,
  createResource,
  createSlotOffering,
  customer,
  db,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
} from "@/test/db";

// Configure both providers for this file (env() is parsed lazily, per test file).
beforeAll(() => {
  vi.stubEnv("PAYMENT_PROVIDER", "paymongo");
  vi.stubEnv("PAYMONGO_SECRET_KEY", "sk_test_paymongo");
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "whsk_test_paymongo");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_stripe");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test_stripe");
  resetEnvCache();
});

type Paid = Extract<PaymentEvent, { kind: "paid" }>;

describeDb("recordProviderPayment", () => {
  let offeringId: string;
  let courtId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings({ depositPercent: "50" });
    await openEveryDay();
    courtId = (await createResource({ name: "Court 1" })).id;
    offeringId = (await createSlotOffering({ resourceIds: [courtId], durationMin: 60, basePrice: "1000" })).id;
  });

  async function pendingBooking(n = 1, now = NOW) {
    const booking = await createBooking(
      // Each helper booking gets its own hour.
      { offering: { id: offeringId }, resourceId: courtId, date: "2030-04-06", startMinute: 540 + n * 60, guestCount: 2, customer: customer(n), source: "ONLINE" },
      { now },
    );
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentProvider: "PAYMONGO", checkoutSessionId: `cs_${n}`, checkoutUrl: "https://checkout.example" },
    });
    return booking;
  }

  const paid = (overrides: Partial<Paid> = {}): Paid => ({
    kind: "paid",
    provider: "PAYMONGO",
    eventId: "evt_1",
    sessionId: "cs_1",
    paymentRef: "pay_1",
    amount: "500.00",
    currency: "PHP",
    method: "gcash",
    raw: { type: "checkout_session.payment.paid" },
    ...overrides,
  });

  it("confirms the booking, records the payment and the event", async () => {
    const booking = await pendingBooking();
    await expect(recordProviderPayment(paid(), NOW)).resolves.toEqual({ outcome: "confirmed", bookingId: booking.id });

    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { payments: true, events: true } });
    expect(row).toMatchObject({ status: "CONFIRMED", holdExpiresAt: null });
    expect(row.amountPaid.toString()).toBe("500");
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0]).toMatchObject({ provider: "PAYMONGO", providerEventId: "evt_1", providerRef: "pay_1", method: "gcash", status: "SUCCEEDED" });
    expect(row.events.map((e) => e.toStatus)).toEqual(["PENDING_PAYMENT", "CONFIRMED"]);
  });

  it("treats a repeated event as a no-op — sequentially and concurrently", async () => {
    await pendingBooking();
    await recordProviderPayment(paid(), NOW);
    await expect(recordProviderPayment(paid(), NOW)).resolves.toMatchObject({ outcome: "duplicate" });
    // Same payment re-sent under a new event id (e.g. a provider retry quirk).
    await expect(recordProviderPayment(paid({ eventId: "evt_2" }), NOW)).resolves.toMatchObject({ outcome: "duplicate" });

    await pendingBooking(2, NOW);
    const burst = await Promise.all(
      Array.from({ length: 5 }, () => recordProviderPayment(paid({ sessionId: "cs_2", eventId: "evt_burst", paymentRef: "pay_burst" }), NOW)),
    );
    expect(burst.filter((r) => r.outcome === "confirmed")).toHaveLength(1);
    expect(burst.filter((r) => r.outcome === "duplicate")).toHaveLength(4);
    expect(await db.payment.count()).toBe(2);
  });

  it("does not confirm when the amount or currency doesn't match the deposit", async () => {
    const booking = await pendingBooking();
    await expect(recordProviderPayment(paid({ amount: "1.00" }), NOW)).resolves.toMatchObject({ outcome: "amount_mismatch" });
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(row.status).toBe("PENDING_PAYMENT");
    expect(row.amountPaid.toString()).toBe("1"); // the money is still on record
    expect(row.internalNotes).toMatch(/expected 500\.00 PHP/);

    await pendingBooking(2);
    await expect(recordProviderPayment(paid({ sessionId: "cs_2", eventId: "e2", paymentRef: "p2", currency: "USD" }), NOW)).resolves.toMatchObject({
      outcome: "amount_mismatch",
    });
  });

  it("late payment: re-confirms an expired booking whose slot is still free", async () => {
    const booking = await pendingBooking();
    const later = addMinutes(NOW, 40); // hold (15 min) long gone, nobody else booked
    await sweepExpiredHolds(later);
    await expect(recordProviderPayment(paid(), later)).resolves.toMatchObject({ outcome: "confirmed" });
    const row = await db.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { events: { orderBy: { createdAt: "asc" } } } });
    expect(row.status).toBe("CONFIRMED");
    expect(row.events.map((e) => e.toStatus)).toEqual(["PENDING_PAYMENT", "EXPIRED", "CONFIRMED"]);
  });

  it("late payment before any expiry ran: a still-pending booking simply confirms (nobody can have taken it)", async () => {
    const booking = await pendingBooking();
    await expect(recordProviderPayment(paid(), addMinutes(NOW, 40))).resolves.toMatchObject({ outcome: "confirmed" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("CONFIRMED");
  });

  it("late payment: keeps the money on record and flags a refund when the slot was taken", async () => {
    const first = await pendingBooking(1);
    const second = await createBooking(
      { offering: { id: offeringId }, resourceId: courtId, date: "2030-04-06", startMinute: 600, guestCount: 2, customer: customer(2), source: "ONLINE" },
      { now: addMinutes(NOW, 20) },
    );
    await expect(recordProviderPayment(paid(), addMinutes(NOW, 25))).resolves.toMatchObject({ outcome: "needs_refund" });
    const row = await db.booking.findUniqueOrThrow({ where: { id: first.id } });
    expect(row.status).toBe("EXPIRED");
    expect(row.amountPaid.toString()).toBe("500");
    expect(row.internalNotes).toMatch(/Refund needed/);
    expect((await db.booking.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("PENDING_PAYMENT");
  });

  it("ignores sessions it doesn't know, or that belong to the other provider", async () => {
    await pendingBooking();
    await expect(recordProviderPayment(paid({ sessionId: "cs_unknown" }), NOW)).resolves.toEqual({ outcome: "unknown_session" });
    await expect(recordProviderPayment(paid({ provider: "STRIPE" }), NOW)).resolves.toEqual({ outcome: "unknown_session" });
    expect(await db.payment.count()).toBe(0);
  });
});

describeDb("POST /api/webhooks/[provider]", () => {
  let bookingId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings({ depositPercent: "50", maxAdvanceDays: 36_500 });
    await openEveryDay();
    const courtId = (await createResource({ name: "Court 1" })).id;
    const offeringId = (await createSlotOffering({ resourceIds: [courtId], durationMin: 60, basePrice: "1000" })).id;
    // Hold far in the future so the real clock (used by the route) is inside it.
    bookingId = (
      await createBooking(
        { offering: { id: offeringId }, resourceId: courtId, date: "2030-04-06", startMinute: 600, guestCount: 2, customer: customer(), source: "ONLINE" },
        { now: new Date() },
      )
    ).id;
    await db.booking.update({ where: { id: bookingId }, data: { paymentProvider: "PAYMONGO", checkoutSessionId: "cs_route" } });
  });
  afterEach(() => vi.useRealTimers());

  function paymongoRequest(body: string, secret = "whsk_test_paymongo") {
    const t = String(Math.floor(Date.now() / 1000));
    return new NextRequest("http://localhost/api/webhooks/paymongo", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "paymongo-signature": `t=${t},te=${paymongoSignature(secret, t, body)},li=` },
    });
  }

  const paymongoBody = (eventId = "evt_route") =>
    JSON.stringify({
      data: {
        id: eventId,
        attributes: {
          type: "checkout_session.payment.paid",
          livemode: false,
          data: {
            id: "cs_route",
            attributes: {
              payment_method_used: "gcash",
              payments: [{ id: `pay_${eventId}`, attributes: { amount: 50000, currency: "PHP", status: "paid" } }],
            },
          },
        },
      },
    });

  const post = async (request: NextRequest, provider = "paymongo") => {
    const { POST } = await import("@/app/api/webhooks/[provider]/route");
    return POST(request, { params: Promise.resolve({ provider }) });
  };

  it("confirms on a valid PayMongo webhook and treats the redelivery as a no-op", async () => {
    const first = await post(paymongoRequest(paymongoBody()));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ received: true, outcome: "confirmed" });
    const again = await post(paymongoRequest(paymongoBody()));
    expect(await again.json()).toEqual({ received: true, outcome: "duplicate" });
    expect(await db.payment.count()).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("CONFIRMED");
  });

  it("rejects a bad signature with 400 and writes nothing", async () => {
    const response = await post(paymongoRequest(paymongoBody(), "whsk_forged"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid signature" });
    expect(await db.payment.count()).toBe(0);
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe("PENDING_PAYMENT");
  });

  it("verifies Stripe signatures on the stripe route", async () => {
    const body = JSON.stringify({ id: "evt_s", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_route" } } });
    const header = new Stripe("sk_test_x").webhooks.generateTestHeaderString({ payload: body, secret: "whsec_forged" });
    const response = await post(new NextRequest("http://localhost/api/webhooks/stripe", { method: "POST", body, headers: { "stripe-signature": header } }), "stripe");
    expect(response.status).toBe(400);
  });

  it("404s for unknown providers and refuses oversized bodies", async () => {
    expect((await post(paymongoRequest(paymongoBody()), "paypal")).status).toBe(404);
    const huge = paymongoRequest("x".repeat(300 * 1024));
    expect((await post(huge)).status).toBe(413);
  });

  it("acknowledges event types it doesn't handle", async () => {
    const body = paymongoBody().replace("checkout_session.payment.paid", "payment.refunded");
    const response = await post(paymongoRequest(body));
    expect(await response.json()).toEqual({ received: true, handled: false });
  });
});
