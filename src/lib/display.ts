import { type LocalDate, MINUTES_PER_DAY, localDateOf } from "./dates";

// Human-readable dates and times, always in the BUSINESS timezone (a customer browsing
// from abroad still sees the resort's local check-in time). Shared by server pages and
// the client booking flow so both render identically.

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}

/** "7:00 PM" */
export function formatClock(instant: Date, timeZone: string, locale: string): string {
  return formatter(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(instant);
}

/** "Fri, Apr 5" */
export function formatShortDate(instant: Date, timeZone: string, locale: string): string {
  return formatter(locale, { timeZone, weekday: "short", month: "short", day: "numeric" }).format(instant);
}

/** "Friday, April 5, 2030" */
export function formatLongDate(instant: Date, timeZone: string, locale: string): string {
  return formatter(locale, { timeZone, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(instant);
}

/** A calendar date with no time attached ("2030-04-05" → "Friday, April 5, 2030"). */
export function formatLocalDate(date: LocalDate, locale: string, style: "long" | "short" = "long"): string {
  const noonUtc = new Date(`${date}T12:00:00Z`);
  return style === "long" ? formatLongDate(noonUtc, "UTC", locale) : formatShortDate(noonUtc, "UTC", locale);
}

/** "April 2030" for a "YYYY-MM" month. */
export function formatMonth(month: string, locale: string): string {
  return formatter(locale, { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
}

/** Minute of day → "7:00 PM" (1440 → "12:00 AM"). */
export function formatMinuteOfDay(minute: number, locale: string): string {
  const m = minute % MINUTES_PER_DAY;
  return formatClock(new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60)), "UTC", locale);
}

/** 45 → "45 min", 60 → "1 hr", 150 → "2 hr 30 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** Countdown text for a hold ending at `endMs`: "14:05", never below "0:00". */
export function formatTimeLeft(endMs: number, nowMs: number): string {
  const left = Math.max(0, Math.round((endMs - nowMs) / 1000));
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

/** How an offering's timing reads on a card: fixed window, or a duration. */
export function describeSchedule(
  offering: { mode: "WINDOW" | "SLOT"; startMinute: number | null; endMinute: number | null; endsNextDay: boolean; durationMin: number | null },
  locale: string,
): string {
  if (offering.mode === "SLOT") return formatDuration(offering.durationMin ?? 0);
  const start = formatMinuteOfDay(offering.startMinute ?? 0, locale);
  const end = formatMinuteOfDay(offering.endMinute ?? 0, locale);
  return offering.endsNextDay ? `${start} to ${end} the next day` : `${start} to ${end}`;
}

/**
 * A booked time range. Same day: "Fri, Apr 5, 10:00 AM to 11:00 AM".
 * Overnight: "Fri, Apr 5, 7:00 PM to Sat, Apr 6, 7:00 AM".
 */
export function formatRange(startAt: Date, endAt: Date, timeZone: string, locale: string): string {
  const start = `${formatShortDate(startAt, timeZone, locale)}, ${formatClock(startAt, timeZone, locale)}`;
  const sameDay = localDateOf(startAt, timeZone) === localDateOf(endAt, timeZone);
  const end = sameDay
    ? formatClock(endAt, timeZone, locale)
    : `${formatShortDate(endAt, timeZone, locale)}, ${formatClock(endAt, timeZone, locale)}`;
  return `${start} to ${end}`;
}
