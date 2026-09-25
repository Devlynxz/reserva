import { TZDate } from "@date-fns/tz";

// Calendar and timezone helpers. Two representations only:
//  - instants: JS Date (what the DB stores as timestamptz)
//  - business-local calendar dates: "YYYY-MM-DD" strings, with times of day as integer
//    minutes after local midnight (0–1440; 1440 = the next midnight).
// Calendar math on LocalDate uses UTC arithmetic, so it never touches the host timezone.

export type LocalDate = string;

export const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class DateError extends Error {
  override name = "DateError";
}

export function isValidLocalDate(value: string): boolean {
  const match = LOCAL_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function parts(date: LocalDate): { year: number; month: number; day: number } {
  if (!isValidLocalDate(date)) throw new DateError(`Invalid date: ${JSON.stringify(date)}`);
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return { year, month, day };
}

function fromUtcDate(value: Date): LocalDate {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parts(date);
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / MS_PER_DAY);
}

/** Every date from `from` to `to`, inclusive. */
export function eachDate(from: LocalDate, to: LocalDate): LocalDate[] {
  const count = daysBetween(from, to);
  return Array.from({ length: Math.max(0, count + 1) }, (_, i) => addDays(from, i));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: LocalDate): number {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function assertTimeZone(timeZone: string): void {
  if (!isValidTimeZone(timeZone)) throw new DateError(`Unknown time zone: ${timeZone}`);
}

function assertMinute(minute: number): void {
  if (!Number.isInteger(minute) || minute < 0 || minute > MINUTES_PER_DAY) {
    throw new DateError(`Minute of day must be an integer 0–1440, got ${minute}`);
  }
}

/**
 * The instant at local `date` + `minute` in `timeZone`.
 * DST: a local time that doesn't exist (spring-forward gap) moves forward by the gap;
 * an ambiguous one (fall-back) resolves to the earlier instant. Callers that need to
 * reject nonexistent times use `isRealLocalTime`.
 */
export function zonedToUtc(date: LocalDate, minute: number, timeZone: string): Date {
  assertMinute(minute);
  assertTimeZone(timeZone);
  const { year, month, day } = parts(date);
  const local = new TZDate(year, month - 1, day, Math.floor(minute / 60), minute % 60, timeZone);
  return new Date(local.getTime());
}

/** False when `minute` on `date` falls in a DST gap (e.g. 02:30 on a spring-forward day). */
export function isRealLocalTime(date: LocalDate, minute: number, timeZone: string): boolean {
  if (minute === MINUTES_PER_DAY) return isRealLocalTime(addDays(date, 1), 0, timeZone);
  const instant = zonedToUtc(date, minute, timeZone);
  return localDateOf(instant, timeZone) === date && localMinuteOf(instant, timeZone) === minute;
}

/** Business-local calendar date of an instant. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  assertTimeZone(timeZone);
  const local = new TZDate(instant.getTime(), timeZone);
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${String(local.getFullYear()).padStart(4, "0")}-${mm}-${dd}`;
}

/** Business-local minute of day (0–1439) of an instant. */
export function localMinuteOf(instant: Date, timeZone: string): number {
  assertTimeZone(timeZone);
  const local = new TZDate(instant.getTime(), timeZone);
  return local.getHours() * 60 + local.getMinutes();
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MS_PER_MINUTE);
}

/** "HH:mm" → minute of day. "24:00" is allowed and means the next midnight. */
export function parseTime(value: string): number {
  const match = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(value);
  if (!match) throw new DateError(`Invalid time: ${JSON.stringify(value)}`);
  const minute = Number(match[1]) * 60 + Number(match[2]);
  if (minute > MINUTES_PER_DAY) throw new DateError(`Invalid time: ${JSON.stringify(value)}`);
  return minute;
}

/** Minute of day → "HH:mm". */
export function formatTime(minute: number): string {
  assertMinute(minute);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
