"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type BookingStatus } from "@/lib/booking-status";
import { manualBookingSchema, recordPaymentSchema } from "@/lib/validation";
import { afterResponse } from "../../after-response";
import { recordManualPayment, updateInternalNotes } from "../../data/admin-bookings";
import { createBooking, transitionBooking } from "../../data/bookings";
import { notifyBookingCancelled, notifyBookingConfirmed } from "../../notifications";
import { type FormState, failure, formObject, guard, invalid, isSession } from "./form";

// Booking operations for ADMIN and STAFF ("bookings" area).

export async function recordPaymentAction(bookingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("bookings");
  if (!isSession(session)) return session;
  const raw = formObject(formData, { booleans: ["confirm"] });
  const parsed = recordPaymentSchema.safeParse({ ...raw, bookingId });
  if (!parsed.success) return invalid(parsed.error);
  try {
    const { confirmed } = await recordManualPayment({ ...parsed.data, confirm: raw.confirm === true, actorId: session.userId });
    if (confirmed) afterResponse(() => notifyBookingConfirmed(bookingId));
    revalidatePath(`/admin/bookings/${bookingId}`);
    return { ok: true, message: confirmed ? "Payment recorded and booking confirmed." : "Payment recorded." };
  } catch (error) {
    return failure(error);
  }
}

const statusChange = z.object({
  to: z.enum(["CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  reason: z.string().trim().max(300).optional(),
});

const DONE: Partial<Record<BookingStatus, string>> = {
  CONFIRMED: "Booking confirmed.",
  CANCELLED: "Booking cancelled. The time is free again.",
  COMPLETED: "Marked as completed.",
  NO_SHOW: "Marked as a no-show.",
};

export async function changeStatusAction(bookingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("bookings");
  if (!isSession(session)) return session;
  const parsed = statusChange.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const { to, reason } = parsed.data;
  try {
    await transitionBooking({ bookingId, to, actor: "staff", actorId: session.userId, note: reason });
    if (to === "CANCELLED") afterResponse(() => notifyBookingCancelled(bookingId, reason ?? null));
    if (to === "CONFIRMED") afterResponse(() => notifyBookingConfirmed(bookingId));
    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin");
    return { ok: true, message: DONE[to] };
  } catch (error) {
    return failure(error);
  }
}

export async function saveNotesAction(bookingId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("bookings");
  if (!isSession(session)) return session;
  const parsed = z.object({ internalNotes: z.string().trim().max(4000).optional() }).safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  await updateInternalNotes(bookingId, parsed.data.internalNotes ?? null);
  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true, message: "Notes saved." };
}

/** Walk-in or message booking: the same createBooking path the public site uses. */
export async function createManualBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("bookings");
  if (!isSession(session)) return session;
  const raw = formObject(formData, { booleans: ["awaitingPayment"] });
  const parsed = manualBookingSchema.safeParse({
    source: raw.source,
    offeringId: raw.offeringId,
    resourceId: raw.resourceId ?? "any",
    date: raw.date,
    startTime: raw.startTime,
    guestCount: raw.guestCount,
    customer: { name: raw.customerName ?? "", email: raw.customerEmail ?? "", ...(raw.customerPhone ? { phone: raw.customerPhone } : {}) },
    customerNotes: raw.customerNotes,
    internalNotes: raw.internalNotes,
    awaitingPayment: raw.awaitingPayment,
  });
  if (!parsed.success) {
    const state = invalid(parsed.error);
    // Flatten customer.* issues onto the form's field names.
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "customer") state.fieldErrors![`customer${String(issue.path[1]).replace(/^./, (c) => c.toUpperCase())}`] = issue.message;
    }
    return state;
  }
  const { offeringId, startTime, ...rest } = parsed.data;
  let bookingId: string;
  try {
    const booking = await createBooking({ ...rest, offering: { id: offeringId }, startMinute: startTime, actorId: session.userId });
    bookingId = booking.id;
    if (booking.status === "CONFIRMED") afterResponse(() => notifyBookingConfirmed(booking.id));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin");
  redirect(`/admin/bookings/${bookingId}`);
}
