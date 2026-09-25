import "server-only";
import type { BookingStatus } from "@/lib/booking-status";
import { money, toAmountString } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import type { CheckoutSession, PaymentEvent } from "../payments/provider";
import { slotStillFree, transitionInTx } from "./bookings";
import { db } from "./db";
import { isUniqueViolation } from "./errors";

type PaidEvent = Extract<PaymentEvent, { kind: "paid" }>;

// ─── Checkout ───────────────────────────────────────────────────────────────

export type CheckoutBooking = {
  id: string;
  referenceCode: string;
  status: BookingStatus;
  holdExpiresAt: Date | null;
  depositAmount: string;
  currency: string;
  customerName: string;
  customerEmail: string;
  offeringName: string;
  resourceName: string;
  paymentProvider: "PAYMONGO" | "STRIPE" | "MANUAL" | null;
  checkoutUrl: string | null;
};

export async function getBookingForCheckout(where: { id: string } | { referenceCode: string }): Promise<CheckoutBooking | null> {
  const b = await db.booking.findUnique({
    where,
    select: {
      id: true,
      referenceCode: true,
      status: true,
      holdExpiresAt: true,
      depositAmount: true,
      currency: true,
      customerName: true,
      customerEmail: true,
      paymentProvider: true,
      checkoutUrl: true,
      offering: { select: { name: true } },
      resource: { select: { name: true } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    referenceCode: b.referenceCode,
    status: b.status,
    holdExpiresAt: b.holdExpiresAt,
    depositAmount: b.depositAmount.toString(),
    currency: b.currency,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    offeringName: b.offering.name,
    resourceName: b.resource.name,
    paymentProvider: b.paymentProvider,
    checkoutUrl: b.checkoutUrl,
  };
}

/**
 * Remember which provider session belongs to the booking: webhooks find it by session id.
 * First writer wins. If two "Pay" clicks raced and both created sessions, the loser's
 * session is never stored (so it can't be paid into a void) and the winner's URL is
 * returned to both.
 */
export async function attachCheckout(bookingId: string, session: CheckoutSession): Promise<string> {
  const { count } = await db.booking.updateMany({
    where: { id: bookingId, OR: [{ checkoutSessionId: null }, { paymentProvider: { not: session.provider } }] },
    data: { paymentProvider: session.provider, checkoutSessionId: session.sessionId, checkoutUrl: session.url },
  });
  if (count === 1) return session.url;
  const current = await db.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { checkoutUrl: true } });
  return current.checkoutUrl ?? session.url;
}

// ─── Webhook payments ───────────────────────────────────────────────────────

/**
 * - confirmed: payment recorded and the booking confirmed (incl. a late payment re-confirmed)
 * - duplicate: this provider event (or payment) was already processed — nothing changed
 * - unknown_session: no booking has this checkout session — nothing recorded
 * - amount_mismatch: payment recorded, booking NOT confirmed (amount/currency ≠ deposit)
 * - needs_refund: payment recorded, but the booking can't be confirmed (slot taken, cancelled…)
 */
export type PaymentOutcome = "confirmed" | "duplicate" | "unknown_session" | "amount_mismatch" | "needs_refund";

type LockedBooking = {
  id: string;
  status: BookingStatus;
  resource_id: string;
  start_at: Date;
  occupied_until: Date;
  deposit_amount: string;
  amount_paid: string;
  currency: string;
  payment_provider: string | null;
};

async function flag(tx: Prisma.TransactionClient, bookingId: string, note: string) {
  // Staff-only note; the admin dashboard lists paid-but-unconfirmed bookings too.
  await tx.$executeRaw`
    UPDATE bookings SET internal_notes = concat_ws(E'\n', internal_notes, ${note}::text) WHERE id = ${bookingId}::uuid`;
}

/**
 * Apply a verified "paid" webhook. One transaction; safe to call any number of times for
 * the same event (the unique (provider, provider_event_id) index makes repeats a no-op).
 * Only this path confirms online payments: success pages merely read the status.
 */
export async function recordProviderPayment(
  event: PaidEvent,
  now = new Date(),
): Promise<{ outcome: PaymentOutcome; bookingId?: string }> {
  try {
    return await db.$transaction(
      async (tx) => {
        const [booking] = await tx.$queryRaw<LockedBooking[]>`
          SELECT id, status, resource_id, start_at, occupied_until, deposit_amount::text, amount_paid::text,
                 currency, payment_provider::text
          FROM bookings WHERE checkout_session_id = ${event.sessionId} FOR UPDATE`;
        if (!booking || booking.payment_provider !== event.provider) return { outcome: "unknown_session" as const };

        if (event.paymentRef) {
          const seen = await tx.payment.count({ where: { provider: event.provider, providerRef: event.paymentRef } });
          if (seen > 0) return { outcome: "duplicate" as const, bookingId: booking.id };
        }

        await tx.payment.create({
          data: {
            bookingId: booking.id,
            provider: event.provider,
            providerRef: event.paymentRef,
            providerEventId: event.eventId,
            amount: event.amount,
            currency: event.currency,
            method: event.method,
            status: "SUCCEEDED",
            raw: event.raw as Prisma.InputJsonValue,
          },
        });
        await tx.booking.update({
          where: { id: booking.id },
          data: { amountPaid: toAmountString(money(booking.amount_paid).plus(money(event.amount)), booking.currency) },
        });

        const expected = `${toAmountString(booking.deposit_amount, booking.currency)} ${booking.currency}`;
        const received = `${event.amount} ${event.currency}`;
        if (event.currency !== booking.currency || !money(event.amount).eq(money(booking.deposit_amount))) {
          await flag(tx, booking.id, `Payment ${event.paymentRef ?? event.eventId}: received ${received}, expected ${expected}. Not confirmed; check with the provider.`);
          return { outcome: "amount_mismatch" as const, bookingId: booking.id };
        }

        if (booking.status === "PENDING_PAYMENT") {
          await transitionInTx(tx, { bookingId: booking.id, to: "CONFIRMED", actor: "webhook", note: `Paid online (${event.method})`, now });
          return { outcome: "confirmed" as const, bookingId: booking.id };
        }

        if (
          booking.status === "EXPIRED" &&
          (await slotStillFree(
            tx,
            { id: booking.id, resourceId: booking.resource_id, startAt: booking.start_at, occupiedUntil: booking.occupied_until },
            now,
          ))
        ) {
          await transitionInTx(tx, {
            bookingId: booking.id,
            to: "CONFIRMED",
            actor: "webhook",
            note: `Paid online after the hold expired (${event.method}); the slot was still free`,
            now,
          });
          return { outcome: "confirmed" as const, bookingId: booking.id };
        }

        await flag(tx, booking.id, `Payment ${event.paymentRef ?? event.eventId} (${received}) arrived while the booking was ${booking.status}. Refund needed.`);
        return { outcome: "needs_refund" as const, bookingId: booking.id };
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
  } catch (error) {
    // Two deliveries of the same event racing: the loser hits the unique index.
    if (isUniqueViolation(error)) return { outcome: "duplicate" };
    throw error;
  }
}
