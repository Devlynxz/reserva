"use server";

import { type MoneyInput, formatMoney, money } from "@/lib/money";
import { bookingRequestSchema, bookingSelectionSchema } from "@/lib/validation";
import { createBooking, previewBooking } from "../data/bookings";
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
    // Phase 5 sends the customer to the payment provider's checkout from here.
    return { ok: true, data: { redirectTo: `/book/${booking.referenceCode}?t=${booking.accessToken}` } };
  } catch (error) {
    return actionError(error);
  }
}
