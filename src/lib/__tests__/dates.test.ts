import { describe, expect, it } from "vitest";
import {
  DateError,
  addDays,
  addMinutes,
  daysBetween,
  eachDate,
  formatTime,
  isRealLocalTime,
  isValidLocalDate,
  isValidTimeZone,
  localDateOf,
  localMinuteOf,
  parseTime,
  weekdayOf,
  zonedToUtc,
} from "../dates";

const MANILA = "Asia/Manila";
const NEW_YORK = "America/New_York";

describe("local dates", () => {
  it.each(["2026-03-10", "2024-02-29", "2026-12-31"])("accepts %s", (d) => expect(isValidLocalDate(d)).toBe(true));

  it.each(["2026-02-29", "2026-13-01", "2026-00-10", "2026-3-10", "20260310", "2026-03-32", ""])("rejects %j", (d) =>
    expect(isValidLocalDate(d)).toBe(false),
  );

  it("does calendar math across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-04-01", "2026-03-01")).toBe(-31);
    expect(eachDate("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(eachDate("2026-01-02", "2026-01-01")).toEqual([]);
  });

  it("knows the weekday (0 = Sunday)", () => {
    expect(weekdayOf("2026-03-08")).toBe(0);
    expect(weekdayOf("2026-03-14")).toBe(6);
  });

  it("throws on invalid input", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(DateError);
  });
});

describe("time of day", () => {
  it("parses and formats HH:mm", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("19:30")).toBe(1170);
    expect(parseTime("24:00")).toBe(1440);
    expect(formatTime(1170)).toBe("19:30");
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(1440)).toBe("24:00");
  });

  it.each(["24:01", "25:00", "9:30", "09:60", "noon"])("rejects %j", (t) => expect(() => parseTime(t)).toThrow(DateError));

  it("rejects out-of-range minutes", () => {
    expect(() => formatTime(1441)).toThrow(DateError);
    expect(() => formatTime(-1)).toThrow(DateError);
    expect(() => formatTime(1.5)).toThrow(DateError);
  });
});

describe("time zones", () => {
  it("validates IANA names", () => {
    expect(isValidTimeZone(MANILA)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(() => zonedToUtc("2026-03-10", 0, "Mars/Olympus")).toThrow(/Unknown time zone/);
    expect(() => localDateOf(new Date(), "Mars/Olympus")).toThrow(/Unknown time zone/);
    expect(() => localMinuteOf(new Date(), "Mars/Olympus")).toThrow(/Unknown time zone/);
  });

  it("converts Manila local time (UTC+8, no DST)", () => {
    expect(zonedToUtc("2026-03-10", 8 * 60, MANILA).toISOString()).toBe("2026-03-10T00:00:00.000Z");
    // Local midnight is the previous UTC day.
    expect(zonedToUtc("2026-03-10", 0, MANILA).toISOString()).toBe("2026-03-09T16:00:00.000Z");
    expect(zonedToUtc("2026-03-10", 1440, MANILA).toISOString()).toBe("2026-03-10T16:00:00.000Z");
  });

  it("maps instants back to the business-local date and minute", () => {
    const instant = new Date("2026-03-09T17:30:00Z"); // 01:30 on the 10th in Manila
    expect(localDateOf(instant, MANILA)).toBe("2026-03-10");
    expect(localMinuteOf(instant, MANILA)).toBe(90);
    expect(localDateOf(instant, "UTC")).toBe("2026-03-09");
  });

  it("handles the spring-forward gap by moving forward", () => {
    // 2026-03-08: New York clocks jump 02:00 → 03:00.
    expect(zonedToUtc("2026-03-08", 150, NEW_YORK).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(isRealLocalTime("2026-03-08", 150, NEW_YORK)).toBe(false);
    expect(isRealLocalTime("2026-03-08", 180, NEW_YORK)).toBe(true);
    expect(isRealLocalTime("2026-03-08", 90, NEW_YORK)).toBe(true);
  });

  it("resolves the fall-back overlap to the earlier instant", () => {
    // 2026-11-01: 01:00–02:00 happens twice in New York; first pass is EDT (UTC-4).
    expect(zonedToUtc("2026-11-01", 90, NEW_YORK).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(isRealLocalTime("2026-11-01", 90, NEW_YORK)).toBe(true);
  });

  it("treats 24:00 as the next day's midnight", () => {
    expect(isRealLocalTime("2026-03-10", 1440, MANILA)).toBe(true);
  });

  it("rejects invalid minutes", () => {
    expect(() => zonedToUtc("2026-03-10", 1441, MANILA)).toThrow(DateError);
    expect(() => zonedToUtc("2026-03-10", -5, MANILA)).toThrow(DateError);
  });

  it("adds absolute minutes", () => {
    expect(addMinutes(new Date("2026-03-08T06:30:00Z"), 60).toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });
});
