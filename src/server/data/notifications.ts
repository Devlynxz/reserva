import "server-only";
import type { BookingStatus } from "@/lib/booking-status";
import { db } from "./db";

/** What a customer email needs about one booking. */
export type BookingEmailRow = {
  id: string;
  referenceCode: string;
  status: BookingStatus;
  customerName: string;
  customerEmail: string;
  offeringName: string;
  resourceName: string;
  resourceType: "SPACE" | "STAFF";
  startAt: Date;
  endAt: Date;
  guestCount: number;
  totalAmount: string;
  depositAmount: string;
  amountPaid: string;
  currency: string;
  holdExpiresAt: Date | null;
};

const select = {
  id: true,
  referenceCode: true,
  status: true,
  customerName: true,
  customerEmail: true,
  startAt: true,
  endAt: true,
  guestCount: true,
  totalAmount: true,
  depositAmount: true,
  amountPaid: true,
  currency: true,
  holdExpiresAt: true,
  offering: { select: { name: true } },
  resource: { select: { name: true, type: true } },
} as const;

function toEmailRow(b: Awaited<ReturnType<typeof findOne>>): BookingEmailRow | null {
  if (!b) return null;
  return {
    id: b.id,
    referenceCode: b.referenceCode,
    status: b.status,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    offeringName: b.offering.name,
    resourceName: b.resource.name,
    resourceType: b.resource.type,
    startAt: b.startAt,
    endAt: b.endAt,
    guestCount: b.guestCount,
    totalAmount: b.totalAmount.toString(),
    depositAmount: b.depositAmount.toString(),
    amountPaid: b.amountPaid.toString(),
    currency: b.currency,
    holdExpiresAt: b.holdExpiresAt,
  };
}

function findOne(id: string) {
  return db.booking.findUnique({ where: { id }, select });
}

export async function getBookingForEmail(id: string): Promise<BookingEmailRow | null> {
  return toEmailRow(await findOne(id));
}

/** Confirmed bookings starting in [from, to) that haven't had a reminder yet. */
export async function listReminderCandidates(from: Date, to: Date): Promise<string[]> {
  const rows = await db.booking.findMany({
    where: { status: "CONFIRMED", reminderSentAt: null, startAt: { gte: from, lt: to } },
    select: { id: true },
    orderBy: { startAt: "asc" },
  });
  return rows.map((r) => r.id);
}

/**
 * Atomically claim a booking's reminder. Only one caller ever gets `true`, so overlapping
 * job runs can't email a customer twice (at-most-once: a failed send isn't retried).
 */
export async function claimReminder(id: string, now: Date): Promise<boolean> {
  const { count } = await db.booking.updateMany({ where: { id, reminderSentAt: null, status: "CONFIRMED" }, data: { reminderSentAt: now } });
  return count === 1;
}
