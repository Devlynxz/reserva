import { describe, expect, it } from "vitest";
import { type BookingHorizon, freeResources, horizonDates, isResourceFree, withinHorizon } from "../availability";
import { bookingSpan } from "../intervals";

const horizon: BookingHorizon = {
  now: new Date("2026-04-01T15:30:00Z"), // 23:30 on Apr 1 in Manila
  timeZone: "Asia/Manila",
  leadTimeMin: 120,
  maxAdvanceDays: 10,
};

describe("withinHorizon", () => {
  it("enforces the lead time", () => {
    expect(withinHorizon(new Date("2026-04-01T17:29:00Z"), horizon)).toBe(false);
    expect(withinHorizon(new Date("2026-04-01T17:30:00Z"), horizon)).toBe(true);
  });

  it("counts max-advance days on the business-local calendar", () => {
    // Today is Apr 1 locally (Mar 31 would be wrong); last bookable date is Apr 11.
    expect(withinHorizon(new Date("2026-04-11T15:59:00Z"), horizon)).toBe(true); // 23:59 Apr 11 local
    expect(withinHorizon(new Date("2026-04-11T16:00:00Z"), horizon)).toBe(false); // 00:00 Apr 12 local
  });
});

describe("horizonDates", () => {
  it("spans today (local) to today + maxAdvanceDays", () => {
    expect(horizonDates(horizon)).toEqual({ first: "2026-04-01", last: "2026-04-11" });
    expect(horizonDates({ ...horizon, now: new Date("2026-04-01T16:00:00Z") })).toEqual({
      first: "2026-04-02",
      last: "2026-04-12",
    });
  });
});

describe("isResourceFree / freeResources", () => {
  const span = bookingSpan(new Date("2026-04-05T02:00:00Z"), new Date("2026-04-05T03:00:00Z"), 30);

  it("counts the buffer as occupied", () => {
    const busyRight = [{ resourceId: "a", startAt: new Date("2026-04-05T03:15:00Z"), occupiedUntil: new Date("2026-04-05T04:00:00Z") }];
    expect(isResourceFree("a", span, busyRight, [])).toBe(false); // our buffer runs to 03:30
    const busyAfter = [{ resourceId: "a", startAt: new Date("2026-04-05T03:30:00Z"), occupiedUntil: new Date("2026-04-05T04:00:00Z") }];
    expect(isResourceFree("a", span, busyAfter, [])).toBe(true);
  });

  it("filters resources in the given order", () => {
    const blocked = [{ resourceId: "b", startAt: new Date("2026-04-05T00:00:00Z"), endAt: new Date("2026-04-06T00:00:00Z") }];
    expect(freeResources(["c", "b", "a"], span, [], blocked)).toEqual(["c", "a"]);
  });
});
