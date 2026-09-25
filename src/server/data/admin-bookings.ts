import "server-only";
import type { BookingSource, BookingStatus } from "@/lib/booking-status";
import { type LocalDate, addDays, zonedToUtc } from "@/lib/dates";
import { money, toAmountString } from "@/lib/money";
import type { PriceBreakdown } from "@/lib/pricing";
import type { Prisma } from "@/generated/prisma/client";
import { transitionInTx } from "./bookings";
import { db } from "./db";
import { BookingNotFoundError } from "./errors";

// Staff-facing booking reads and writes. Status changes still go through transitionInTx.

export const PAGE_SIZE = 25;

export type BookingListFilters = {
  status?: BookingStatus;
  source?: BookingSource;
  /** Business-local dates, inclusive, on the booking's start. */
  from?: LocalDate;
  to?: LocalDate;
  /** Reference, name, email or phone. */
  q?: string;
  page?: number;
};

export type BookingListRow = {
  id: string;
  referenceCode: string;
  status: BookingStatus;
  source: BookingSource;
  startAt: Date;
  endAt: Date;
  customerName: string;
  customerEmail: string;
  offeringName: string;
  resourceName: string;
  totalAmount: string;
  amountPaid: string;
  currency: string;
};

export async function listBookings(filters: BookingListFilters, timeZone: string) {
  const q = filters.q?.trim();
  const where: Prisma.BookingWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.from || filters.to
      ? {
          startAt: {
            ...(filters.from ? { gte: zonedToUtc(filters.from, 0, timeZone) } : {}),
            ...(filters.to ? { lt: zonedToUtc(addDays(filters.to, 1), 0, timeZone) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { referenceCode: { contains: q.toUpperCase().replace(/\s+/g, "") } },
            { customerName: { contains: q, mode: "insensitive" } },
            { customerEmail: { contains: q, mode: "insensitive" } },
            { customerPhone: { contains: q } },
          ],
        }
      : {}),
  };
  const page = Math.max(1, filters.page ?? 1);
  const [rows, total] = await Promise.all([
    db.booking.findMany({
      where,
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        referenceCode: true,
        status: true,
        source: true,
        startAt: true,
        endAt: true,
        customerName: true,
        customerEmail: true,
        totalAmount: true,
        amountPaid: true,
        currency: true,
        offering: { select: { name: true } },
        resource: { select: { name: true } },
      },
    }),
    db.booking.count({ where }),
  ]);
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    rows: rows.map(
      (b): BookingListRow => ({
        id: b.id,
        referenceCode: b.referenceCode,
        status: b.status,
        source: b.source,
        startAt: b.startAt,
        endAt: b.endAt,
        customerName: b.customerName,
        customerEmail: b.customerEmail,
        offeringName: b.offering.name,
        resourceName: b.resource.name,
        totalAmount: b.totalAmount.toString(),
        amountPaid: b.amountPaid.toString(),
        currency: b.currency,
      }),
    ),
  };
}

export async function getBookingDetail(id: string) {
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      offering: { select: { name: true, mode: true } },
      resource: { select: { name: true, type: true } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
      payments: { orderBy: { createdAt: "asc" }, include: { recordedBy: { select: { name: true } } } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    referenceCode: b.referenceCode,
    status: b.status,
    source: b.source,
    startAt: b.startAt,
    endAt: b.endAt,
    holdExpiresAt: b.holdExpiresAt,
    offeringName: b.offering.name,
    resourceName: b.resource.name,
    resourceType: b.resource.type,
    customerName: b.customerName,
    customerEmail: b.customerEmail,
    customerPhone: b.customerPhone,
    guestCount: b.guestCount,
    customerNotes: b.customerNotes,
    internalNotes: b.internalNotes,
    totalAmount: b.totalAmount.toString(),
    depositAmount: b.depositAmount.toString(),
    amountPaid: b.amountPaid.toString(),
    currency: b.currency,
    price: b.priceBreakdown as PriceBreakdown,
    paymentProvider: b.paymentProvider,
    createdAt: b.createdAt,
    events: b.events.map((e) => ({
      id: e.id,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      note: e.note,
      actor: e.actor?.name ?? null,
      createdAt: e.createdAt,
    })),
    payments: b.payments.map((p) => ({
      id: p.id,
      provider: p.provider,
      method: p.method,
      amount: p.amount.toString(),
      currency: p.currency,
      status: p.status,
      providerRef: p.providerRef,
      recordedBy: p.recordedBy?.name ?? null,
      createdAt: p.createdAt,
    })),
  };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBookingDetail>>>;

export class PaymentAmountError extends Error {
  override name = "PaymentAmountError";
}

/**
 * Money staff took in person (cash, bank transfer, GCash to the front desk…). Optionally
 * confirms a pending booking in the same transaction — "paid at the counter".
 */
export async function recordManualPayment(input: {
  bookingId: string;
  amount: string;
  method: string;
  note?: string;
  confirm: boolean;
  actorId: string;
  now?: Date;
}): Promise<{ confirmed: boolean }> {
  return db.$transaction(async (tx) => {
    const [b] = await tx.$queryRaw<Array<{ status: BookingStatus; total_amount: string; amount_paid: string; currency: string }>>`
      SELECT status, total_amount::text, amount_paid::text, currency FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
    if (!b) throw new BookingNotFoundError();

    const amount = money(input.amount);
    const balance = money(b.total_amount).minus(money(b.amount_paid));
    if (amount.lte(0)) throw new PaymentAmountError("Enter an amount above 0.");
    if (amount.gt(balance)) {
      throw new PaymentAmountError(`That's more than the balance of ${toAmountString(balance, b.currency)} ${b.currency}.`);
    }

    await tx.payment.create({
      data: {
        bookingId: input.bookingId,
        provider: "MANUAL",
        amount: toAmountString(amount, b.currency),
        currency: b.currency,
        method: input.method,
        status: "SUCCEEDED",
        recordedById: input.actorId,
        raw: input.note ? { note: input.note } : undefined,
      },
    });
    await tx.booking.update({
      where: { id: input.bookingId },
      data: { amountPaid: toAmountString(money(b.amount_paid).plus(amount), b.currency) },
    });

    if (input.confirm && b.status === "PENDING_PAYMENT") {
      await transitionInTx(tx, {
        bookingId: input.bookingId,
        to: "CONFIRMED",
        actor: "staff",
        actorId: input.actorId,
        note: `Payment recorded (${input.method.replace("_", " ")})`,
        now: input.now,
      });
      return { confirmed: true };
    }
    return { confirmed: false };
  });
}

export async function updateInternalNotes(bookingId: string, notes: string | null): Promise<void> {
  await db.booking.update({ where: { id: bookingId }, data: { internalNotes: notes } });
}

// ─── Calendar ───────────────────────────────────────────────────────────────

export type CalendarBooking = {
  id: string;
  referenceCode: string;
  status: BookingStatus;
  resourceId: string;
  startAt: Date;
  endAt: Date;
  customerName: string;
  offeringName: string;
};

/** Bookings that hold or held time (not cancelled/expired) and blocks overlapping [from, to). */
export async function calendarItems(from: Date, to: Date, resourceId?: string) {
  const [bookings, blocks] = await Promise.all([
    db.booking.findMany({
      where: {
        status: { in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(resourceId ? { resourceId } : {}),
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        referenceCode: true,
        status: true,
        resourceId: true,
        startAt: true,
        endAt: true,
        customerName: true,
        offering: { select: { name: true } },
      },
    }),
    db.blockedPeriod.findMany({
      where: {
        startAt: { lt: to },
        endAt: { gt: from },
        ...(resourceId ? { OR: [{ resourceId }, { resourceId: null }] } : {}),
      },
      orderBy: { startAt: "asc" },
      select: { id: true, resourceId: true, startAt: true, endAt: true, reason: true },
    }),
  ]);
  return {
    bookings: bookings.map((b): CalendarBooking => ({ ...b, offeringName: b.offering.name })),
    blocks,
  };
}
