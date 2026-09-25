import { type LocalDate, MINUTES_PER_DAY, addDays, eachDate, weekdayOf, zonedToUtc } from "./dates";
import { type HoursRow, hoursFor } from "./slots";

// Occupancy = booked time ÷ bookable time, over business-local days.
//
// Bookable time per resource per day follows business hours (a court open 06:00–22:00
// offers 16 hours). A resource with no hours anywhere — a resort villa sold in fixed
// windows — is bookable around the clock, so a Day Tour (9 h) plus an Overnight (12 h)
// reads as 21/24 of that day. Booked time is the customer-facing span (not the cleaning
// buffer), clipped to the period.

export type OccupiedSpan = { resourceId: string; startAt: Date; endAt: Date };

export type Occupancy = { bookedMinutes: number; bookableMinutes: number; rate: number };

export function bookableMinutes(resourceId: string, date: LocalDate, hours: readonly HoursRow[]): number {
  const hasAnyHours = hours.some((h) => h.resourceId === resourceId || h.resourceId === null);
  if (!hasAnyHours) return MINUTES_PER_DAY;
  return hoursFor(resourceId, weekdayOf(date), hours).reduce((sum, h) => sum + (h.closeMinute - h.openMinute), 0);
}

export function occupancy(input: {
  from: LocalDate;
  /** Inclusive. */
  to: LocalDate;
  timeZone: string;
  resourceIds: readonly string[];
  hours: readonly HoursRow[];
  spans: readonly OccupiedSpan[];
}): Occupancy {
  const { from, to, timeZone, resourceIds, hours, spans } = input;
  const dates = eachDate(from, to);
  const bookable = resourceIds.reduce((sum, id) => sum + dates.reduce((s, d) => s + bookableMinutes(id, d, hours), 0), 0);

  const periodStart = zonedToUtc(from, 0, timeZone).getTime();
  const periodEnd = zonedToUtc(addDays(to, 1), 0, timeZone).getTime();
  const included = new Set(resourceIds);
  const booked = spans.reduce((sum, span) => {
    if (!included.has(span.resourceId)) return sum;
    const start = Math.max(span.startAt.getTime(), periodStart);
    const end = Math.min(span.endAt.getTime(), periodEnd);
    return end > start ? sum + (end - start) / 60_000 : sum;
  }, 0);

  const bookedMinutes = Math.round(booked);
  return {
    bookedMinutes,
    bookableMinutes: bookable,
    // Capped: staff can book outside opening hours (a late walk-in), which shouldn't read as >100%.
    rate: bookable === 0 ? 0 : Math.min(1, bookedMinutes / bookable),
  };
}
