import { type BlockSpan, type BookingHorizon, type BusySpan, freeResources, withinHorizon } from "./availability";
import { addDays, DateError, type LocalDate, zonedToUtc } from "./dates";
import { type BookingSpan, bookingSpan } from "./intervals";

// WINDOW mode: a package is a fixed local time window, e.g.
//   Day Tour   08:00 → 17:00
//   Overnight  19:00 → 07:00 (+1 day)
//   22 Hours   14:00 → 12:00 (+1 day)
// The customer picks a date; the window is laid on that date in the business timezone.

export type WindowOffering = {
  startMinute: number;
  endMinute: number;
  /** Must equal `endMinute <= startMinute` (also a DB CHECK). */
  endsNextDay: boolean;
  bufferMin: number;
};

export class WindowError extends Error {
  override name = "WindowError";
}

function assertWindow(offering: WindowOffering): void {
  const { startMinute, endMinute, endsNextDay } = offering;
  for (const minute of [startMinute, endMinute]) {
    if (!Number.isInteger(minute) || minute < 0 || minute > 1439) {
      throw new WindowError(`Window times must be whole minutes 0–1439, got ${minute}`);
    }
  }
  if (endsNextDay !== endMinute <= startMinute) {
    throw new WindowError("endsNextDay must be true exactly when the window ends at or before it starts");
  }
}

/** The booking span for a window offering starting on local `date`. */
export function windowSpan(offering: WindowOffering, date: LocalDate, timeZone: string): BookingSpan {
  assertWindow(offering);
  const startAt = zonedToUtc(date, offering.startMinute, timeZone);
  const endAt = zonedToUtc(offering.endsNextDay ? addDays(date, 1) : date, offering.endMinute, timeZone);
  // Only reachable if a DST shift swallows a very short window; refuse rather than invert.
  if (endAt.getTime() <= startAt.getTime()) throw new DateError(`Window on ${date} has no duration in ${timeZone}`);
  return bookingSpan(startAt, endAt, offering.bufferMin);
}

export type WindowDay = BookingSpan & {
  date: LocalDate;
  /** Resources that can take this window, in preference order. Empty = sold out. */
  freeResourceIds: string[];
};

/**
 * Availability for a window offering across `dates`. Dates outside the booking horizon
 * are omitted; dates inside it are always returned (sold-out days have no free resources)
 * so a calendar can show them as unavailable rather than missing.
 */
export function windowAvailability(input: {
  offering: WindowOffering;
  dates: readonly LocalDate[];
  resourceIds: readonly string[];
  busy: readonly BusySpan[];
  blocked: readonly BlockSpan[];
  horizon: BookingHorizon;
}): WindowDay[] {
  const { offering, dates, resourceIds, busy, blocked, horizon } = input;
  const days: WindowDay[] = [];
  for (const date of dates) {
    const span = windowSpan(offering, date, horizon.timeZone);
    if (!withinHorizon(span.startAt, horizon)) continue;
    days.push({ date, ...span, freeResourceIds: freeResources(resourceIds, span, busy, blocked) });
  }
  return days;
}
