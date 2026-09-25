"use server";

import { type MoneyInput, formatMoney, money } from "@/lib/money";
import { normalizeReferenceCode } from "@/lib/reference-code";
import { bookingRequestSchema, bookingSelectionSchema } from "@/lib/validation";
import { afterResponse } from "../after-response";
import { canViewBooking, grantBookingAccess } from "../booking-access";
import { openCheckout } from "../checkout";
import { createBooking, previewBooking } from "../data/bookings";
import { findCustomerBooking } from "../data/public";
import { notifyBookingReceived } from "../notifications";
import { rateLimit, tooManyRequestsMessage } from "../rate-limit";
import { clientIp } from "../request";
import { type ActionResult, actionError, invalidInput } from "./result";

// Public booking actions. Validate → rate-limit → delegate to server/data. The client
// never sends a price; the preview shown on the review step comes from the same code
// that prices the real booking.

/** `price` lines are successive prices (base → weekend → override); only the last applies. */
export type PreviewLine = { kind: "price" | "extra_guests"; label: string; amount: string };
export type BookingPreviewDTO = {
  startAt: string;
  endAt: string;
  lines: PreviewLine[];
  total: string;
  deposit: string;
  balance: string;
  depositPercent: string;
  isFullPayment: boolean;
};

export async function previewBookingAction(raw: unknown): Promise<ActionResult<BookingPreviewDTO>> {
  const parsed = bookingSelectionSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error);

  const limit = await rateLimit("bookingPreview", await clientIp());
  if (!limit.allowed) return { ok: false, error: tooManyRequestsMessage(limit.retryAfterSec), code: "rate_limited" };

  const { offeringSlug, startTime, ...selection } = parsed.data;
  try {
    const { startAt, endAt, price } = await previewBooking({
      ...selection,
      offering: { slug: offeringSlug },
      startMinute: startTime,
      source: "ONLINE",
    });
    const fmt = (amount: MoneyInput) => formatMoney(amount, price.currency);
    const balance = money(price.total).minus(money(price.deposit));
    return {
      ok: true,
      data: {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        lines: price.lines.map((line) => ({
          kind: line.kind === "extra_guests" ? ("extra_guests" as const) : ("price" as const),
          label: line.kind === "extra_guests" && line.unitAmount ? `${line.label} × ${fmt(line.unitAmount)}` : line.label,
          amount: fmt(line.amount),
        })),
        total: fmt(price.total),
        deposit: fmt(price.deposit),
        balance: fmt(balance),
        depositPercent: price.depositPercent,
        isFullPayment: price.deposit === price.total,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function createBookingAction(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = bookingRequestSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error);

  const limit = await rateLimit("bookingCreate", await clientIp());
  if (!limit.allowed) return { ok: false, error: tooManyRequestsMessage(limit.retryAfterSec), code: "rate_limited" };

  const { offeringSlug, startTime, notes, ...request } = parsed.data;
  try {
    const booking = await createBooking({
      ...request,
      offering: { slug: offeringSlug },
      startMinute: startTime,
      customerNotes: notes,
      source: "ONLINE",
    });
    await grantBookingAccess(booking.referenceCode);
    const checkout = await openCheckout(booking.id, { cancelOnFailure: true });
    if (checkout.status === "failed") return { ok: false, error: checkout.message, code: "checkout_failed" };

    // The "received" email carries the booking link; it goes out after the response.
    afterResponse(() => notifyBookingReceived(booking.id));
    return {
      ok: true,
      data: {
        redirectTo: checkout.status === "redirect" ? checkout.url : `/book/${booking.referenceCode}?t=${booking.accessToken}`,
      },
    };
  } catch (error) {
    return actionError(error);
  }
}

/** "Pay deposit" on the booking page: reopen (or open) checkout for a pending booking. */
export async function payDepositAction(rawReference: string, token?: string): Promise<ActionResult<{ redirectTo: string }>> {
  const reference = normalizeReferenceCode(String(rawReference));
  const found = reference ? await findCustomerBooking(reference) : null;
  if (!reference || !found || !(await canViewBooking(reference, found.accessTokenHash, token))) {
    return { ok: false, error: "We can't find that booking. Open it again from your link or Find my booking.", code: "not_found" };
  }
  const bookingId = found.id;
  const checkout = await openCheckout(bookingId);
  switch (checkout.status) {
    case "redirect":
      return { ok: true, data: { redirectTo: checkout.url } };
    case "payments_off":
      return { ok: false, error: "Online payment isn't available. Please contact us to pay.", code: "payments_off" };
    case "not_payable":
      return { ok: false, error: "This booking can't be paid online anymore. Reload the page to see its status.", code: "not_payable" };
    case "failed":
      return { ok: false, error: checkout.message, code: "checkout_failed" };
  }
}
