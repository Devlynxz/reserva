import { describe, expect, it } from "vitest";
import { bookableMinutes, occupancy } from "../occupancy";
import type { HoursRow } from "../slots";

const TZ = "Asia/Manila";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+08:00`);

describe("bookableMinutes", () => {
  const hours: HoursRow[] = [
    { resourceId: null, weekday: 1, openMinute: 6 * 60, closeMinute: 22 * 60 },
    { resourceId: "carlo", weekday: 1, openMinute: 12 * 60, closeMinute: 14 * 60 },
    { resourceId: "carlo", weekday: 1, openMinute: 15 * 60, closeMinute: 20 * 60 },
  ];

  it("follows business hours, own schedule first", () => {
    expect(bookableMinutes("court", "2030-04-01", hours)).toBe(16 * 60); // Monday
    expect(bookableMinutes("carlo", "2030-04-01", hours)).toBe(7 * 60);
    expect(bookableMinutes("court", "2030-04-02", hours)).toBe(0); // no Tuesday rows = closed
  });

  it("treats resources with no hours at all as bookable around the clock", () => {
    expect(bookableMinutes("villa", "2030-04-01", [])).toBe(1440);
  });
});

describe("occupancy", () => {
  it("is booked time over bookable time, per resource and day", () => {
    const result = occupancy({
      from: "2030-04-01",
      to: "2030-04-02",
      timeZone: TZ,
      resourceIds: ["villa", "kubo"],
      hours: [],
      spans: [
        { resourceId: "villa", startAt: at("2030-04-01", "08:00"), endAt: at("2030-04-01", "17:00") }, // 9 h
        { resourceId: "villa", startAt: at("2030-04-01", "19:00"), endAt: at("2030-04-02", "07:00") }, // 12 h
        { resourceId: "other", startAt: at("2030-04-01", "08:00"), endAt: at("2030-04-01", "17:00") }, // not counted
      ],
    });
    expect(result).toEqual({ bookedMinutes: 21 * 60, bookableMinutes: 4 * 1440, rate: (21 * 60) / (4 * 1440) });
  });

  it("clips spans to the period", () => {
    const result = occupancy({
      from: "2030-04-01",
      to: "2030-04-01",
      timeZone: TZ,
      resourceIds: ["villa"],
      hours: [],
      spans: [
        { resourceId: "villa", startAt: at("2030-03-31", "19:00"), endAt: at("2030-04-01", "07:00") }, // 7 h inside
        { resourceId: "villa", startAt: at("2030-04-01", "19:00"), endAt: at("2030-04-02", "07:00") }, // 5 h inside
        { resourceId: "villa", startAt: at("2030-04-03", "08:00"), endAt: at("2030-04-03", "09:00") }, // outside
      ],
    });
    expect(result.bookedMinutes).toBe(12 * 60);
  });

  it("caps at 100% and handles nothing bookable", () => {
    const closed = occupancy({
      from: "2030-04-02",
      to: "2030-04-02",
      timeZone: TZ,
      resourceIds: ["court"],
      hours: [{ resourceId: null, weekday: 1, openMinute: 0, closeMinute: 60 }],
      spans: [{ resourceId: "court", startAt: at("2030-04-02", "10:00"), endAt: at("2030-04-02", "11:00") }],
    });
    expect(closed).toEqual({ bookedMinutes: 60, bookableMinutes: 0, rate: 0 });

    const over = occupancy({
      from: "2030-04-01",
      to: "2030-04-01",
      timeZone: TZ,
      resourceIds: ["court"],
      hours: [{ resourceId: null, weekday: 1, openMinute: 9 * 60, closeMinute: 10 * 60 }],
      spans: [{ resourceId: "court", startAt: at("2030-04-01", "08:00"), endAt: at("2030-04-01", "11:00") }],
    });
    expect(over.rate).toBe(1);
  });
});
