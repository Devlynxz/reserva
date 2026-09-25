import { addDays, type LocalDate, localDateOf } from "./dates";
import { type BookingSpan, type Interval, occupied, overlaps } from "./intervals";

// Rules shared by WINDOW and SLOT availability. They mirror what the database enforces
// (exclusion constraint + block triggers) so the UI only offers times the insert will
// accept. The database still has the final word under concurrency.

/** An active booking's occupied range. Stale holds must already be filtered out. */
export type BusySpan = { resourceId: string; startAt: Date; occupiedUntil: Date };

/** A blocked period. `resourceId: null` closes every resource. */
export type BlockSpan = { resourceId: string | null; startAt: Date; endAt: Date };

export type BookingHorizon = {
  now: Date;
  timeZone: string;
  /** Minimum minutes between now and a booking's start. */
  leadTimeMin: number;
  /** Furthest bookable business-local date, counted from today. */
  maxAdvanceDays: number;
};

/** Not too soon (lead time) and not too far ahead (max advance days). */
export function withinHorizon(startAt: Date, horizon: BookingHorizon): boolean {
  const earliest = horizon.now.getTime() + horizon.leadTimeMin * 60_000;
  if (startAt.getTime() < earliest) return false;
  const lastDate = addDays(localDateOf(horizon.now, horizon.timeZone), horizon.maxAdvanceDays);
  return localDateOf(startAt, horizon.timeZone) <= lastDate;
}

/** True when `span` collides with nothing already on `resourceId`. */
export function isResourceFree(
  resourceId: string,
  span: BookingSpan,
  busy: readonly BusySpan[],
  blocked: readonly BlockSpan[],
): boolean {
  const range = occupied(span);
  for (const b of busy) {
    if (b.resourceId === resourceId && overlaps(range, { start: b.startAt, end: b.occupiedUntil })) return false;
  }
  for (const b of blocked) {
    if ((b.resourceId === null || b.resourceId === resourceId) && overlaps(range, blockInterval(b))) return false;
  }
  return true;
}

function blockInterval(block: BlockSpan): Interval {
  return { start: block.startAt, end: block.endAt };
}

/** Resources (in the given order) that can take `span`. Order = "any staff" preference. */
export function freeResources(
  resourceIds: readonly string[],
  span: BookingSpan,
  busy: readonly BusySpan[],
  blocked: readonly BlockSpan[],
): string[] {
  return resourceIds.filter((id) => isResourceFree(id, span, busy, blocked));
}

/** Business-local dates a calendar should offer, from today to the horizon's end. */
export function horizonDates(horizon: BookingHorizon): { first: LocalDate; last: LocalDate } {
  const first = localDateOf(horizon.now, horizon.timeZone);
  return { first, last: addDays(first, horizon.maxAdvanceDays) };
}
