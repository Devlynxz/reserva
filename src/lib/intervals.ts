// Half-open time ranges [start, end), matching Postgres `tstzrange(start, end, '[)')`.
// Two back-to-back bookings (10:00–11:00 and 11:00–12:00) don't overlap — here or in the DB.

export type Interval = { start: Date; end: Date };

/** What a booking occupies: the customer-facing time plus the turnover buffer after it. */
export type BookingSpan = { startAt: Date; endAt: Date; occupiedUntil: Date };

export function isEmpty(interval: Interval): boolean {
  return interval.start.getTime() >= interval.end.getTime();
}

/** Same rule as the `&&` operator on ranges: empty ranges overlap nothing. */
export function overlaps(a: Interval, b: Interval): boolean {
  if (isEmpty(a) || isEmpty(b)) return false;
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start.getTime() <= inner.start.getTime() && inner.end.getTime() <= outer.end.getTime();
}

/** Sorted, with overlapping or touching ranges merged. Empty ranges are dropped. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((i) => !isEmpty(i)).toSorted((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const next of sorted) {
    const last = merged.at(-1);
    if (last && next.start.getTime() <= last.end.getTime()) {
      if (next.end.getTime() > last.end.getTime()) last.end = next.end;
    } else {
      merged.push({ start: next.start, end: next.end });
    }
  }
  return merged;
}

/** Build a span from start/end plus a buffer in minutes (absolute time, DST-proof). */
export function bookingSpan(startAt: Date, endAt: Date, bufferMin: number): BookingSpan {
  if (!(startAt.getTime() < endAt.getTime())) throw new RangeError("A booking must end after it starts");
  if (!Number.isInteger(bufferMin) || bufferMin < 0) throw new RangeError("Buffer must be a whole, non-negative minute count");
  return { startAt, endAt, occupiedUntil: new Date(endAt.getTime() + bufferMin * 60_000) };
}

/** The range the exclusion constraint compares: [startAt, occupiedUntil). */
export function occupied(span: BookingSpan): Interval {
  return { start: span.startAt, end: span.occupiedUntil };
}
