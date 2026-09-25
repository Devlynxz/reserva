import "server-only";
import type { BlockSpan, BookingHorizon, BusySpan } from "@/lib/availability";
import { type LocalDate, addDays, eachDate, zonedToUtc } from "@/lib/dates";
import { freeSlots } from "@/lib/slots";
import { windowAvailability } from "@/lib/windows";
import { findBookableOffering, loadHours } from "./catalog";
import { db } from "./db";
import { getSettings } from "./settings";

/**
 * Everything the public site learns about the schedule. By design it has exactly three
 * fields: nothing about who booked, how many, or why a time is unavailable.
 */
export type PublicOption = { resourceId: string; startAt: Date; endAt: Date };

export type PublicAvailability = { mode: "WINDOW" | "SLOT"; options: PublicOption[] };

/**
 * Bookable options for an offering between two business-local dates (inclusive).
 * Mirrors the database rules: active bookings (stale holds count as free), buffers,
 * blocked periods, lead time and max advance days.
 */
export async function getPublicAvailability(
  query: { offeringSlug: string; from: LocalDate; to: LocalDate },
  options: { now?: Date } = {},
): Promise<PublicAvailability | null> {
  const now = options.now ?? new Date();
  const [settings, offering] = await Promise.all([getSettings(), findBookableOffering({ slug: query.offeringSlug })]);
  if (!offering) return null;

  const tz = settings.timezone;
  const horizon: BookingHorizon = { now, timeZone: tz, leadTimeMin: settings.leadTimeMin, maxAdvanceDays: settings.maxAdvanceDays };
  const resourceIds = offering.resourceIds;
  // Wide enough for windows that start the day before `from` or end two days after `to`.
  const rangeStart = zonedToUtc(addDays(query.from, -1), 0, tz);
  const rangeEnd = zonedToUtc(addDays(query.to, 2), 0, tz);

  const [busyRows, blockRows] = await Promise.all([
    db.booking.findMany({
      where: {
        resourceId: { in: resourceIds },
        startAt: { lt: rangeEnd },
        occupiedUntil: { gt: rangeStart },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING_PAYMENT", OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }] },
        ],
      },
      // Only what's needed to compute overlaps — never names, emails or notes.
      select: { resourceId: true, startAt: true, occupiedUntil: true },
    }),
    db.blockedPeriod.findMany({
      where: {
        OR: [{ resourceId: { in: resourceIds } }, { resourceId: null }],
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      select: { resourceId: true, startAt: true, endAt: true },
    }),
  ]);
  const busy: BusySpan[] = busyRows;
  const blocked: BlockSpan[] = blockRows;
  const dates = eachDate(query.from, query.to);

  if (offering.mode === "WINDOW") {
    const days = windowAvailability({
      offering: {
        startMinute: offering.startMinute!,
        endMinute: offering.endMinute!,
        endsNextDay: offering.endsNextDay,
        bufferMin: offering.bufferMin,
      },
      dates,
      resourceIds,
      busy,
      blocked,
      horizon,
    });
    return {
      mode: "WINDOW",
      options: days.flatMap((day) => day.freeResourceIds.map((resourceId) => ({ resourceId, startAt: day.startAt, endAt: day.endAt }))),
    };
  }

  const hours = await loadHours(resourceIds);
  const slotOffering = { durationMin: offering.durationMin!, slotStepMin: offering.slotStepMin!, bufferMin: offering.bufferMin };
  return {
    mode: "SLOT",
    options: dates.flatMap((date) =>
      freeSlots({ offering: slotOffering, date, resourceIds, hours, busy, blocked, horizon }).flatMap((slot) =>
        slot.freeResourceIds.map((resourceId) => ({ resourceId, startAt: slot.startAt, endAt: slot.endAt })),
      ),
    ),
  };
}
