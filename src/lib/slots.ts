import { type BlockSpan, type BookingHorizon, type BusySpan, isResourceFree, withinHorizon } from "./availability";
import { addMinutes, isRealLocalTime, type LocalDate, MINUTES_PER_DAY, weekdayOf, zonedToUtc } from "./dates";
import { type BookingSpan, bookingSpan } from "./intervals";

// SLOT mode: fixed-duration services on a grid inside business hours, e.g. a 60-minute
// court every 60 minutes, or a 45-minute haircut every 15 minutes with a chosen stylist.
//
// Rules:
//  - Grid starts at each opening time and steps by `slotStepMin`.
//  - A slot must END by closing time. Its turnover buffer may run past closing.
//  - Duration and buffer are real elapsed minutes, so slots stay correct across DST.
//  - Local times that don't exist (DST gap) are never offered.

export type SlotOffering = { durationMin: number; slotStepMin: number; bufferMin: number };

/** One opening interval. `resourceId: null` = business-wide hours. */
export type HoursRow = { resourceId: string | null; weekday: number; openMinute: number; closeMinute: number };

export class SlotError extends Error {
  override name = "SlotError";
}

function assertSlotOffering({ durationMin, slotStepMin, bufferMin }: SlotOffering): void {
  if (!Number.isInteger(durationMin) || durationMin <= 0) throw new SlotError("durationMin must be a positive integer");
  if (!Number.isInteger(slotStepMin) || slotStepMin <= 0) throw new SlotError("slotStepMin must be a positive integer");
  if (!Number.isInteger(bufferMin) || bufferMin < 0) throw new SlotError("bufferMin must be a non-negative integer");
}

/**
 * Opening intervals for one resource on one weekday. A resource with ANY hours of its own
 * follows only its own schedule (so a stylist can have a day off while the salon is open);
 * otherwise it follows the business-wide hours. No rows for the weekday = closed.
 */
export function hoursFor(resourceId: string, weekday: number, hours: readonly HoursRow[]): HoursRow[] {
  const own = hours.filter((h) => h.resourceId === resourceId);
  const schedule = own.length > 0 ? own : hours.filter((h) => h.resourceId === null);
  return schedule.filter((h) => h.weekday === weekday).toSorted((a, b) => a.openMinute - b.openMinute);
}

/** Candidate start minutes (local) for the given opening intervals, ascending, unique. */
export function slotGrid(intervals: readonly Pick<HoursRow, "openMinute" | "closeMinute">[], offering: SlotOffering): number[] {
  assertSlotOffering(offering);
  const starts = new Set<number>();
  for (const { openMinute, closeMinute } of intervals) {
    for (let m = openMinute; m + offering.durationMin <= closeMinute && m < MINUTES_PER_DAY; m += offering.slotStepMin) {
      starts.add(m);
    }
  }
  return [...starts].toSorted((a, b) => a - b);
}

/** The booking span for a slot starting at local `date` + `startMinute`. */
export function slotSpan(offering: SlotOffering, date: LocalDate, startMinute: number, timeZone: string): BookingSpan {
  assertSlotOffering(offering);
  const startAt = zonedToUtc(date, startMinute, timeZone);
  return bookingSpan(startAt, addMinutes(startAt, offering.durationMin), offering.bufferMin);
}

/**
 * Slots for one resource on one date. Filters grid starts that are nonexistent local
 * times or whose real end passes closing time (both only differ from the plain grid on
 * DST-change days).
 */
function resourceSlots(
  resourceId: string,
  offering: SlotOffering,
  date: LocalDate,
  hours: readonly HoursRow[],
  timeZone: string,
): Array<{ startMinute: number; span: BookingSpan }> {
  const slots: Array<{ startMinute: number; span: BookingSpan }> = [];
  for (const interval of hoursFor(resourceId, weekdayOf(date), hours)) {
    const closeAt = zonedToUtc(date, interval.closeMinute, timeZone);
    for (const startMinute of slotGrid([interval], offering)) {
      if (!isRealLocalTime(date, startMinute, timeZone)) continue;
      const span = slotSpan(offering, date, startMinute, timeZone);
      if (span.endAt.getTime() > closeAt.getTime()) continue;
      slots.push({ startMinute, span });
    }
  }
  return slots;
}

/** True when `startMinute` is a real grid slot for this resource on `date`. */
export function isOnGrid(input: {
  offering: SlotOffering;
  resourceId: string;
  date: LocalDate;
  startMinute: number;
  hours: readonly HoursRow[];
  timeZone: string;
}): boolean {
  const { offering, resourceId, date, startMinute, hours, timeZone } = input;
  return resourceSlots(resourceId, offering, date, hours, timeZone).some((s) => s.startMinute === startMinute);
}

export type FreeSlot = BookingSpan & {
  startMinute: number;
  /** Resources that can take this slot, in preference order ("any staff" picks the first). */
  freeResourceIds: string[];
};

/**
 * Free slots on `date` across `resourceIds` (a slot is listed when at least one resource
 * can take it). Resources may have different hours, so each resource gets its own grid.
 * Note the horizon check uses the slot's start, so today's past slots drop out.
 */
export function freeSlots(input: {
  offering: SlotOffering;
  date: LocalDate;
  resourceIds: readonly string[];
  hours: readonly HoursRow[];
  busy: readonly BusySpan[];
  blocked: readonly BlockSpan[];
  horizon: BookingHorizon;
}): FreeSlot[] {
  const { offering, date, resourceIds, hours, busy, blocked, horizon } = input;
  const byStart = new Map<number, FreeSlot>();

  for (const resourceId of resourceIds) {
    for (const { startMinute, span } of resourceSlots(resourceId, offering, date, hours, horizon.timeZone)) {
      if (!withinHorizon(span.startAt, horizon) || !isResourceFree(resourceId, span, busy, blocked)) continue;
      const slot = byStart.get(startMinute) ?? { startMinute, ...span, freeResourceIds: [] };
      slot.freeResourceIds.push(resourceId);
      byStart.set(startMinute, slot);
    }
  }

  // Resources are visited in the caller's order, so each slot's list keeps that preference.
  return [...byStart.values()].toSorted((a, b) => a.startMinute - b.startMinute);
}
