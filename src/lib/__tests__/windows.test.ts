import { describe, expect, it } from "vitest";
import type { BookingHorizon } from "../availability";
import { DateError } from "../dates";
import { type WindowOffering, WindowError, windowAvailability, windowSpan } from "../windows";

const MANILA = "Asia/Manila";
const iso = (d: Date) => d.toISOString();

// The three resort packages from the brief. 60 min turnover between guests.
const DAY_TOUR: WindowOffering = { startMinute: 8 * 60, endMinute: 17 * 60, endsNextDay: false, bufferMin: 60 };
const OVERNIGHT: WindowOffering = { startMinute: 19 * 60, endMinute: 7 * 60, endsNextDay: true, bufferMin: 60 };
const TWENTY_TWO: WindowOffering = { startMinute: 14 * 60, endMinute: 12 * 60, endsNextDay: true, bufferMin: 60 };

describe("windowSpan", () => {
  it("lays a same-day window on the date in the business timezone", () => {
    const span = windowSpan(DAY_TOUR, "2026-04-04", MANILA);
    expect(iso(span.startAt)).toBe("2026-04-04T00:00:00.000Z"); // 08:00 Manila
    expect(iso(span.endAt)).toBe("2026-04-04T09:00:00.000Z"); // 17:00 Manila
    expect(iso(span.occupiedUntil)).toBe("2026-04-04T10:00:00.000Z"); // + 60 min cleaning
  });

  it("ends overnight windows on the next local day", () => {
    const span = windowSpan(OVERNIGHT, "2026-04-04", MANILA);
    expect(iso(span.startAt)).toBe("2026-04-04T11:00:00.000Z"); // 19:00 on the 4th
    expect(iso(span.endAt)).toBe("2026-04-04T23:00:00.000Z"); // 07:00 on the 5th
  });

  it("handles a 22-hour window", () => {
    const span = windowSpan(TWENTY_TWO, "2026-04-04", MANILA);
    expect(span.endAt.getTime() - span.startAt.getTime()).toBe(22 * 3_600_000);
  });

  it("allows a full 24-hour window (end = start, next day)", () => {
    const span = windowSpan({ startMinute: 600, endMinute: 600, endsNextDay: true, bufferMin: 0 }, "2026-04-04", MANILA);
    expect(span.endAt.getTime() - span.startAt.getTime()).toBe(24 * 3_600_000);
  });

  it("uses real elapsed time across DST (New York spring forward)", () => {
    const span = windowSpan(OVERNIGHT, "2026-03-07", "America/New_York");
    expect(span.endAt.getTime() - span.startAt.getTime()).toBe(11 * 3_600_000); // 12h on the clock, 11h elapsed
  });

  it("rejects a window whose endsNextDay flag disagrees with its times", () => {
    expect(() => windowSpan({ ...DAY_TOUR, endsNextDay: true }, "2026-04-04", MANILA)).toThrow(WindowError);
    expect(() => windowSpan({ ...OVERNIGHT, endsNextDay: false }, "2026-04-04", MANILA)).toThrow(WindowError);
  });

  it("rejects out-of-range minutes", () => {
    expect(() => windowSpan({ ...DAY_TOUR, startMinute: 1440 }, "2026-04-04", MANILA)).toThrow(WindowError);
    expect(() => windowSpan({ ...DAY_TOUR, endMinute: 17.5 }, "2026-04-04", MANILA)).toThrow(WindowError);
  });

  it("refuses a window that DST turns inside out", () => {
    // New York, 2026-03-08: 02:30 doesn't exist and becomes 03:30, AFTER the 03:15 end.
    const inverted: WindowOffering = { startMinute: 150, endMinute: 195, endsNextDay: false, bufferMin: 0 };
    expect(() => windowSpan(inverted, "2026-03-08", "America/New_York")).toThrow(DateError);
    // The same window on an ordinary day is fine.
    expect(() => windowSpan(inverted, "2026-03-09", "America/New_York")).not.toThrow();
  });
});

describe("windowAvailability", () => {
  const horizon: BookingHorizon = {
    now: new Date("2026-04-01T00:00:00Z"), // 08:00 on Apr 1, Manila
    timeZone: MANILA,
    leadTimeMin: 60,
    maxAdvanceDays: 30,
  };
  const villa = "villa";
  const kubo = "kubo";

  it("lets a Day Tour and the Overnight after it share a villa", () => {
    const overnight = windowSpan(OVERNIGHT, "2026-04-04", MANILA);
    const days = windowAvailability({
      offering: DAY_TOUR,
      dates: ["2026-04-04", "2026-04-05"],
      resourceIds: [villa],
      busy: [{ resourceId: villa, startAt: overnight.startAt, occupiedUntil: overnight.occupiedUntil }],
      blocked: [],
      horizon,
    });
    // Day Tour 08–17 (+1h) ends 18:00, before the 19:00 check-in; the morning after,
    // the overnight is out at 07:00 and cleaned by 08:00, exactly when the Day Tour starts.
    expect(days.map((d) => [d.date, d.freeResourceIds])).toEqual([
      ["2026-04-04", [villa]],
      ["2026-04-05", [villa]],
    ]);
  });

  it("blocks a 22-hour stay that overlaps a Day Tour", () => {
    const dayTour = windowSpan(DAY_TOUR, "2026-04-05", MANILA);
    const days = windowAvailability({
      offering: TWENTY_TWO,
      dates: ["2026-04-04", "2026-04-05"],
      resourceIds: [villa, kubo],
      busy: [{ resourceId: villa, startAt: dayTour.startAt, occupiedUntil: dayTour.occupiedUntil }],
      blocked: [],
      horizon,
    });
    // Apr 4 14:00 → Apr 5 12:00 hits the Apr 5 Day Tour on the villa; the kubo is free.
    expect(days[0]?.freeResourceIds).toEqual([kubo]);
    // Apr 5 14:00 starts while the Day Tour (till 17:00 + cleaning) is on.
    expect(days[1]?.freeResourceIds).toEqual([kubo]);
  });

  it("marks blocked days as sold out instead of hiding them", () => {
    const days = windowAvailability({
      offering: DAY_TOUR,
      dates: ["2026-04-04"],
      resourceIds: [villa, kubo],
      busy: [],
      blocked: [
        { resourceId: villa, startAt: new Date("2026-04-03T16:00:00Z"), endAt: new Date("2026-04-04T16:00:00Z") },
        { resourceId: null, startAt: new Date("2026-04-04T08:00:00Z"), endAt: new Date("2026-04-04T09:00:00Z") },
      ],
      horizon,
    });
    expect(days).toHaveLength(1);
    expect(days[0]?.freeResourceIds).toEqual([]);
  });

  it("drops dates outside the booking horizon", () => {
    const days = windowAvailability({
      offering: DAY_TOUR,
      dates: ["2026-03-31", "2026-04-01", "2026-04-02", "2026-05-01", "2026-05-02"],
      resourceIds: [villa],
      busy: [],
      blocked: [],
      horizon,
    });
    // Apr 1's 08:00 start is already past; May 1 = today + 30 is the last bookable date.
    expect(days.map((d) => d.date)).toEqual(["2026-04-02", "2026-05-01"]);
  });

  it("ignores bookings on other resources", () => {
    const tour = windowSpan(DAY_TOUR, "2026-04-04", MANILA);
    const days = windowAvailability({
      offering: DAY_TOUR,
      dates: ["2026-04-04"],
      resourceIds: [villa],
      busy: [{ resourceId: kubo, startAt: tour.startAt, occupiedUntil: tour.occupiedUntil }],
      blocked: [{ resourceId: kubo, startAt: tour.startAt, endAt: tour.endAt }],
      horizon,
    });
    expect(days[0]?.freeResourceIds).toEqual([villa]);
  });
});
