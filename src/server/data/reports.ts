import "server-only";
import { type LocalDate, addDays, localDateOf, zonedToUtc } from "@/lib/dates";
import { sum, toAmountString } from "@/lib/money";
import { occupancy } from "@/lib/occupancy";
import { loadHours } from "./catalog";
import { db } from "./db";

// Numbers for the dashboard and the monthly report. Money is collected-basis: what
// actually came in (payments) in the period, next to what was booked.

/** "YYYY-MM" → its first and last business-local date. */
export function monthBounds(month: string): { first: LocalDate; last: LocalDate } {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  return { first, last: addDays(`${next}-01`, -1) };
}

async function monthOccupancy(first: LocalDate, last: LocalDate, timeZone: string) {
  const from = zonedToUtc(first, 0, timeZone);
  const to = zonedToUtc(addDays(last, 1), 0, timeZone);
  const resources = await db.resource.findMany({ where: { isActive: true }, select: { id: true } });
  const resourceIds = resources.map((r) => r.id);
  const [hours, spans] = await Promise.all([
    loadHours(resourceIds),
    db.booking.findMany({
      where: { status: { in: ["CONFIRMED", "COMPLETED"] }, startAt: { lt: to }, endAt: { gt: from } },
      select: { resourceId: true, startAt: true, endAt: true },
    }),
  ]);
  return occupancy({ from: first, to: last, timeZone, resourceIds, hours, spans });
}

async function collected(from: Date, to: Date, currency: string) {
  const payments = await db.payment.findMany({
    where: { status: "SUCCEEDED", createdAt: { gte: from, lt: to } },
    select: { amount: true, method: true, provider: true },
  });
  const byMethod = new Map<string, string[]>();
  for (const p of payments) byMethod.set(p.method, [...(byMethod.get(p.method) ?? []), p.amount.toString()]);
  return {
    total: toAmountString(sum(payments.map((p) => p.amount.toString())), currency),
    count: payments.length,
    byMethod: [...byMethod.entries()]
      .map(([method, amounts]) => ({ method, count: amounts.length, total: toAmountString(sum(amounts), currency) }))
      .sort((a, b) => a.method.localeCompare(b.method)),
  };
}

const attentionNote = /Refund needed|Not confirmed/;

export async function dashboardData(now: Date, settings: { timezone: string; currency: string }) {
  const tz = settings.timezone;
  const today = localDateOf(now, tz);
  const todayStart = zonedToUtc(today, 0, tz);
  const tomorrowStart = zonedToUtc(addDays(today, 1), 0, tz);
  const weekEnd = zonedToUtc(addDays(today, 8), 0, tz);
  const month = today.slice(0, 7);
  const { first, last } = monthBounds(month);

  const listSelect = {
    id: true,
    referenceCode: true,
    status: true,
    startAt: true,
    endAt: true,
    customerName: true,
    guestCount: true,
    offering: { select: { name: true } },
    resource: { select: { name: true } },
  } as const;

  const [todayBookings, upcoming, upcomingCount, pendingCount, flagged, occupancyResult, money, monthBookings] = await Promise.all([
    db.booking.findMany({
      where: { startAt: { gte: todayStart, lt: tomorrowStart }, status: { in: ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "NO_SHOW"] } },
      orderBy: { startAt: "asc" },
      select: listSelect,
    }),
    db.booking.findMany({
      where: { startAt: { gte: tomorrowStart, lt: weekEnd }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } },
      orderBy: { startAt: "asc" },
      take: 8,
      select: listSelect,
    }),
    db.booking.count({ where: { startAt: { gte: tomorrowStart, lt: weekEnd }, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } }),
    db.booking.count({ where: { status: "PENDING_PAYMENT", startAt: { gte: now } } }),
    // Money on a hold that lapsed, or a payment the webhook couldn't apply: someone must act.
    // (A cancelled booking that kept its deposit is a normal policy outcome, not listed.)
    db.booking.findMany({
      where: {
        OR: [
          { status: "EXPIRED", amountPaid: { gt: 0 } },
          { internalNotes: { contains: "Refund needed" } },
          { internalNotes: { contains: "Not confirmed" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { ...listSelect, amountPaid: true, currency: true, internalNotes: true },
    }),
    monthOccupancy(first, last, tz),
    collected(zonedToUtc(first, 0, tz), zonedToUtc(addDays(last, 1), 0, tz), settings.currency),
    db.booking.count({
      where: { startAt: { gte: zonedToUtc(first, 0, tz), lt: zonedToUtc(addDays(last, 1), 0, tz) }, status: { in: ["CONFIRMED", "COMPLETED", "NO_SHOW"] } },
    }),
  ]);

  const shape = (b: (typeof todayBookings)[number]) => ({
    id: b.id,
    referenceCode: b.referenceCode,
    status: b.status,
    startAt: b.startAt,
    endAt: b.endAt,
    customerName: b.customerName,
    guestCount: b.guestCount,
    offeringName: b.offering.name,
    resourceName: b.resource.name,
  });

  return {
    today: todayBookings.map(shape),
    upcoming: upcoming.map(shape),
    upcomingCount,
    pendingCount,
    attention: flagged.map((b) => ({
      ...shape(b),
      amountPaid: b.amountPaid.toString(),
      currency: b.currency,
      reason: b.internalNotes?.split("\n").reverse().find((line) => attentionNote.test(line)) ?? `Paid while ${b.status.toLowerCase()}`,
    })),
    month: { month, bookings: monthBookings, collected: money.total, occupancy: occupancyResult },
  };
}

export async function monthReport(month: string, settings: { timezone: string; currency: string }) {
  const tz = settings.timezone;
  const { first, last } = monthBounds(month);
  const from = zonedToUtc(first, 0, tz);
  const to = zonedToUtc(addDays(last, 1), 0, tz);

  const [bookings, money, occupancyResult] = await Promise.all([
    db.booking.findMany({
      where: { startAt: { gte: from, lt: to } },
      select: { status: true, totalAmount: true, offering: { select: { name: true } } },
    }),
    collected(from, to, settings.currency),
    monthOccupancy(first, last, tz),
  ]);

  const byStatus = new Map<string, number>();
  const byOffering = new Map<string, { count: number; amounts: string[] }>();
  for (const b of bookings) {
    byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
    if (b.status === "CONFIRMED" || b.status === "COMPLETED" || b.status === "NO_SHOW") {
      const entry = byOffering.get(b.offering.name) ?? { count: 0, amounts: [] };
      entry.count++;
      entry.amounts.push(b.totalAmount.toString());
      byOffering.set(b.offering.name, entry);
    }
  }
  const offerings = [...byOffering.entries()]
    .map(([name, e]) => ({ name, count: e.count, booked: toAmountString(sum(e.amounts), settings.currency) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    month,
    first,
    last,
    totalBookings: bookings.length,
    byStatus: Object.fromEntries(byStatus),
    offerings,
    booked: toAmountString(sum(offerings.map((o) => o.booked)), settings.currency),
    collected: money,
    occupancy: occupancyResult,
  };
}

/** One row per booking starting in the month, for the CSV export. */
export async function exportBookings(month: string, timeZone: string) {
  const { first, last } = monthBounds(month);
  return db.booking.findMany({
    where: { startAt: { gte: zonedToUtc(first, 0, timeZone), lt: zonedToUtc(addDays(last, 1), 0, timeZone) } },
    orderBy: { startAt: "asc" },
    select: {
      referenceCode: true,
      status: true,
      source: true,
      startAt: true,
      endAt: true,
      guestCount: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      totalAmount: true,
      depositAmount: true,
      amountPaid: true,
      currency: true,
      createdAt: true,
      offering: { select: { name: true } },
      resource: { select: { name: true } },
    },
  });
}
