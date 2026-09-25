import "server-only";
import { normalizeHex, readableTextOn } from "@/lib/color";
import { addDays, localDateOf, localMinuteOf, zonedToUtc } from "@/lib/dates";
import { formatClock, formatLongDate, formatRange } from "@/lib/display";
import { formatMoney, money } from "@/lib/money";
import { reservaConfig } from "@reserva/config";
import { type BookingEmailRow, claimReminder, getBookingForEmail, listReminderCandidates } from "./data/notifications";
import { type BusinessSettings, getSettings } from "./data/settings";
import {
  type BookingEmailProps,
  BookingCancelledEmail,
  BookingConfirmedEmail,
  BookingReceivedEmail,
  BookingReminderEmail,
} from "./email/templates/booking-emails";
import { type SendResult, sendEmail } from "./email/send";
import { env } from "./env";
import { deriveAccessToken } from "./tokens";

// Customer emails for booking lifecycle moments. Every function is best-effort: it logs
// and returns a result, never throws, so a mail outage can't break a booking or webhook.

const LOCALE = reservaConfig.locale;

/** Absolute link to the customer's booking page, with its (re-derivable) access token. */
export function bookingLink(referenceCode: string, bookingId: string): string {
  const { NEXT_PUBLIC_APP_URL, BETTER_AUTH_SECRET } = env();
  return `${NEXT_PUBLIC_APP_URL}/book/${referenceCode}?t=${deriveAccessToken(BETTER_AUTH_SECRET, bookingId)}`;
}

function baseProps(b: BookingEmailRow, settings: BusinessSettings): BookingEmailProps {
  const brandColor = normalizeHex(settings.brandColor) ?? reservaConfig.brand.color;
  const where = b.resourceType === "STAFF" ? "With" : "Place";
  return {
    brand: {
      businessName: settings.businessName,
      brandColor,
      contact: [settings.contactPhone, settings.contactEmail].filter(Boolean).join(" or ") || null,
      address: settings.address,
    },
    brandText: readableTextOn(brandColor),
    customerName: b.customerName.split(" ")[0] ?? b.customerName,
    referenceCode: b.referenceCode,
    details: [
      { label: "Package", value: b.offeringName },
      { label: where, value: b.resourceName },
      { label: "When", value: formatRange(b.startAt, b.endAt, settings.timezone, LOCALE) },
      ...(b.guestCount > 1 ? [{ label: "Guests", value: String(b.guestCount) }] : []),
      { label: "Total", value: formatMoney(b.totalAmount, b.currency, LOCALE) },
    ],
    link: bookingLink(b.referenceCode, b.id),
  };
}

function balanceOf(b: BookingEmailRow): string | null {
  const balance = money(b.totalAmount).minus(money(b.amountPaid));
  return balance.gt(0) ? formatMoney(balance, b.currency, LOCALE) : null;
}

async function load(bookingId: string) {
  const [booking, settings] = await Promise.all([getBookingForEmail(bookingId), getSettings()]);
  return booking ? { booking, settings } : null;
}

function logResult(kind: string, reference: string, result: SendResult): SendResult {
  if (result.status === "failed") console.error(`[email ${kind} ${reference}] failed: ${result.error}`);
  return result;
}

async function safely(kind: string, run: () => Promise<SendResult>): Promise<SendResult> {
  try {
    return await run();
  } catch (error) {
    console.error(`[email ${kind}] failed:`, error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

/** New online booking waiting for its deposit. */
export function notifyBookingReceived(bookingId: string): Promise<SendResult> {
  return safely("received", async () => {
    const loaded = await load(bookingId);
    if (!loaded || loaded.booking.status !== "PENDING_PAYMENT" || !loaded.booking.holdExpiresAt) return { status: "skipped" };
    const { booking, settings } = loaded;
    const deposit = formatMoney(booking.depositAmount, booking.currency, LOCALE);
    const holdUntil = formatClock(booking.holdExpiresAt!, settings.timezone, LOCALE);
    const result = await sendEmail({
      to: booking.customerEmail,
      subject: `Pay your deposit to confirm ${booking.referenceCode}`,
      react: BookingReceivedEmail({ ...baseProps(booking, settings), deposit, holdUntil }),
      replyTo: settings.contactEmail ?? undefined,
    });
    return logResult("received", booking.referenceCode, result);
  });
}

/** Payment received (webhook) or staff confirmed the booking. */
export function notifyBookingConfirmed(bookingId: string): Promise<SendResult> {
  return safely("confirmed", async () => {
    const loaded = await load(bookingId);
    if (!loaded || loaded.booking.status !== "CONFIRMED") return { status: "skipped" };
    const { booking, settings } = loaded;
    const result = await sendEmail({
      to: booking.customerEmail,
      subject: `Confirmed: ${booking.offeringName}, ${booking.referenceCode}`,
      react: BookingConfirmedEmail({
        ...baseProps(booking, settings),
        paid: formatMoney(booking.amountPaid, booking.currency, LOCALE),
        balance: balanceOf(booking),
      }),
      replyTo: settings.contactEmail ?? undefined,
    });
    return logResult("confirmed", booking.referenceCode, result);
  });
}

export function notifyBookingCancelled(bookingId: string, reason: string | null = null): Promise<SendResult> {
  return safely("cancelled", async () => {
    const loaded = await load(bookingId);
    if (!loaded || loaded.booking.status !== "CANCELLED") return { status: "skipped" };
    const { booking, settings } = loaded;
    const result = await sendEmail({
      to: booking.customerEmail,
      subject: `Cancelled: ${booking.referenceCode}`,
      react: BookingCancelledEmail({ ...baseProps(booking, settings), reason }),
      replyTo: settings.contactEmail ?? undefined,
    });
    return logResult("cancelled", booking.referenceCode, result);
  });
}

export const REMINDER_LOCAL_HOUR = 9;

/**
 * Reminders go out once a day at 09:00 business time, for confirmed bookings that start
 * tomorrow (business-local). Run it hourly: outside 09:00 it does nothing, and each
 * booking's reminder is claimed atomically, so repeats and overlaps never double-send.
 */
export async function sendDueReminders(now = new Date(), options: { ignoreHour?: boolean } = {}) {
  const settings = await getSettings();
  const tz = settings.timezone;
  if (!options.ignoreHour && Math.floor(localMinuteOf(now, tz) / 60) !== REMINDER_LOCAL_HOUR) return { sent: 0, skipped: "not 09:00" };

  const tomorrow = addDays(localDateOf(now, tz), 1);
  const ids = await listReminderCandidates(zonedToUtc(tomorrow, 0, tz), zonedToUtc(addDays(tomorrow, 1), 0, tz));
  let sent = 0;
  for (const id of ids) {
    if (!(await claimReminder(id, now))) continue;
    const result = await safely("reminder", async () => {
      const booking = await getBookingForEmail(id);
      if (!booking) return { status: "skipped" };
      return logResult(
        "reminder",
        booking.referenceCode,
        await sendEmail({
          to: booking.customerEmail,
          subject: `Tomorrow: ${booking.offeringName} at ${settings.businessName}`,
          react: BookingReminderEmail({
            ...baseProps(booking, settings),
            startsAt: `${formatLongDate(booking.startAt, tz, LOCALE)} at ${formatClock(booking.startAt, tz, LOCALE)}`,
            balance: balanceOf(booking),
          }),
          replyTo: settings.contactEmail ?? undefined,
        }),
      );
    });
    if (result.status !== "failed") sent++;
  }
  return { sent, candidates: ids.length };
}
