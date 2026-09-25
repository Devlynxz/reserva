import { describe, expect, it } from "vitest";
import type { BookingHorizon, BusySpan } from "../availability";
import { formatTime } from "../dates";
import { type HoursRow, SlotError, freeSlots, hoursFor, isOnGrid, slotGrid, slotSpan } from "../slots";

const MANILA = "Asia/Manila";
const H = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const times = (starts: number[]) => starts.map(formatTime);

const COURT = { durationMin: 60, slotStepMin: 60, bufferMin: 0 };
const HAIRCUT = { durationMin: 45, slotStepMin: 15, bufferMin: 15 };

// 2026-04-07 is a Tuesday (weekday 2).
const TUESDAY = "2026-04-07";
const hours: HoursRow[] = [
  { resourceId: null, weekday: 2, openMinute: H("09:00"), closeMinute: H("12:00") },
  { resourceId: null, weekday: 2, openMinute: H("13:00"), closeMinute: H("15:00") }, // lunch break
  { resourceId: "ana", weekday: 2, openMinute: H("10:00"), closeMinute: H("12:00") }, // Ana's own Tuesday
  { resourceId: null, weekday: 3, openMinute: H("09:00"), closeMinute: H("17:00") },
];

const horizon: BookingHorizon = {
  now: new Date("2026-04-01T00:00:00Z"),
  timeZone: MANILA,
  leadTimeMin: 60,
  maxAdvanceDays: 60,
};

const busy = (resourceId: string, from: string, to: string, date = TUESDAY): BusySpan => ({
  resourceId,
  startAt: new Date(`${date}T${from}:00+08:00`),
  occupiedUntil: new Date(`${date}T${to}:00+08:00`),
});

describe("hoursFor", () => {
  it("uses the resource's own rows when it has any for that weekday", () => {
    expect(hoursFor("ana", 2, hours).map((h) => h.openMinute)).toEqual([H("10:00")]);
  });

  it("falls back to business-wide rows, sorted", () => {
    const shuffled = [hours[1]!, hours[0]!, hours[3]!];
    expect(hoursFor("ben", 2, shuffled).map((h) => formatTime(h.openMinute))).toEqual(["09:00", "13:00"]);
  });

  it("returns nothing on a closed day", () => {
    expect(hoursFor("ben", 0, hours)).toEqual([]);
  });
});

describe("slotGrid", () => {
  it("steps through each opening interval; slots must end by closing", () => {
    expect(times(slotGrid(hoursFor("ben", 2, hours), COURT))).toEqual(["09:00", "10:00", "11:00", "13:00", "14:00"]);
  });

  it("uses a finer step than the duration", () => {
    expect(times(slotGrid([{ openMinute: H("09:00"), closeMinute: H("10:15") }], HAIRCUT))).toEqual([
      "09:00",
      "09:15",
      "09:30",
    ]);
  });

  it("dedupes overlapping intervals and handles an interval too short for one slot", () => {
    const grid = slotGrid(
      [
        { openMinute: H("09:00"), closeMinute: H("11:00") },
        { openMinute: H("10:00"), closeMinute: H("11:00") },
        { openMinute: H("16:00"), closeMinute: H("16:30") },
      ],
      COURT,
    );
    expect(times(grid)).toEqual(["09:00", "10:00"]);
  });

  it("allows a slot that ends exactly at midnight", () => {
    expect(times(slotGrid([{ openMinute: H("22:00"), closeMinute: 1440 }], COURT))).toEqual(["22:00", "23:00"]);
  });

  it.each([
    { durationMin: 0, slotStepMin: 15, bufferMin: 0 },
    { durationMin: 30, slotStepMin: 0, bufferMin: 0 },
    { durationMin: 30, slotStepMin: 15, bufferMin: -1 },
    { durationMin: 30.5, slotStepMin: 15, bufferMin: 0 },
  ])("rejects invalid offering %j", (offering) => {
    expect(() => slotGrid([], offering)).toThrow(SlotError);
  });
});

describe("slotSpan", () => {
  it("adds duration and buffer in real minutes", () => {
    const span = slotSpan(HAIRCUT, TUESDAY, H("10:00"), MANILA);
    expect(span.startAt.toISOString()).toBe("2026-04-07T02:00:00.000Z");
    expect(span.endAt.toISOString()).toBe("2026-04-07T02:45:00.000Z");
    expect(span.occupiedUntil.toISOString()).toBe("2026-04-07T03:00:00.000Z");
  });
});

describe("isOnGrid", () => {
  const base = { offering: COURT, date: TUESDAY, hours, timeZone: MANILA };

  it("accepts grid starts and rejects everything else", () => {
    expect(isOnGrid({ ...base, resourceId: "ben", startMinute: H("09:00") })).toBe(true);
    expect(isOnGrid({ ...base, resourceId: "ben", startMinute: H("09:30") })).toBe(false); // off-grid
    expect(isOnGrid({ ...base, resourceId: "ben", startMinute: H("12:00") })).toBe(false); // lunch
    expect(isOnGrid({ ...base, resourceId: "ben", startMinute: H("15:00") })).toBe(false); // would end after close
    expect(isOnGrid({ ...base, resourceId: "ana", startMinute: H("09:00") })).toBe(false); // Ana starts at 10
  });
});

describe("freeSlots", () => {
  it("lists every slot as free on an empty day", () => {
    const slots = freeSlots({ offering: COURT, date: TUESDAY, resourceIds: ["c1", "c2"], hours, busy: [], blocked: [], horizon });
    expect(times(slots.map((s) => s.startMinute))).toEqual(["09:00", "10:00", "11:00", "13:00", "14:00"]);
    expect(slots[0]?.freeResourceIds).toEqual(["c1", "c2"]);
  });

  it("removes a resource from slots its bookings overlap, keeping others", () => {
    const slots = freeSlots({
      offering: COURT,
      date: TUESDAY,
      resourceIds: ["c1", "c2"],
      hours,
      busy: [busy("c1", "10:00", "11:00")],
      blocked: [],
      horizon,
    });
    const tenOClock = slots.find((s) => s.startMinute === H("10:00"));
    expect(tenOClock?.freeResourceIds).toEqual(["c2"]);
    expect(slots.find((s) => s.startMinute === H("11:00"))?.freeResourceIds).toEqual(["c1", "c2"]); // back-to-back OK
  });

  it("drops a slot entirely when no resource is free", () => {
    const slots = freeSlots({
      offering: COURT,
      date: TUESDAY,
      resourceIds: ["c1"],
      hours,
      busy: [busy("c1", "09:30", "10:30")],
      blocked: [],
      horizon,
    });
    expect(times(slots.map((s) => s.startMinute))).toEqual(["11:00", "13:00", "14:00"]);
  });

  it("respects each booking's turnover buffer", () => {
    // Existing 10:00 haircut occupies until 11:00 (45 min + 15 buffer).
    const slots = freeSlots({
      offering: HAIRCUT,
      date: TUESDAY,
      resourceIds: ["ben"],
      hours,
      busy: [busy("ben", "10:00", "11:00")],
      blocked: [],
      horizon,
    });
    const starts = times(slots.map((s) => s.startMinute));
    // A 09:15 cut would occupy till 10:15 → clashes; 09:00 ends (with buffer) exactly at 10:00.
    expect(starts).toContain("09:00");
    expect(starts).not.toContain("09:15");
    expect(starts).not.toContain("10:45");
    expect(starts).toContain("11:00");
    // The last morning slot ends at 11:45 + buffer 12:00 = closing; 11:15 still fits (ends 12:00).
    expect(starts.filter((t) => t < "12:00").at(-1)).toBe("11:15");
  });

  it("gives each resource its own hours; 'any staff' order is preserved", () => {
    const slots = freeSlots({ offering: COURT, date: TUESDAY, resourceIds: ["ben", "ana"], hours, busy: [], blocked: [], horizon });
    expect(slots.find((s) => s.startMinute === H("09:00"))?.freeResourceIds).toEqual(["ben"]);
    expect(slots.find((s) => s.startMinute === H("10:00"))?.freeResourceIds).toEqual(["ben", "ana"]);
    expect(slots.find((s) => s.startMinute === H("13:00"))?.freeResourceIds).toEqual(["ben"]); // Ana is off after 12
  });

  it("honours resource and business-wide blocks", () => {
    const slots = freeSlots({
      offering: COURT,
      date: TUESDAY,
      resourceIds: ["c1", "c2"],
      hours,
      busy: [],
      blocked: [
        { resourceId: "c1", startAt: new Date("2026-04-07T09:00:00+08:00"), endAt: new Date("2026-04-07T10:00:00+08:00") },
        { resourceId: null, startAt: new Date("2026-04-07T14:00:00+08:00"), endAt: new Date("2026-04-07T15:00:00+08:00") },
      ],
      horizon,
    });
    expect(slots.find((s) => s.startMinute === H("09:00"))?.freeResourceIds).toEqual(["c2"]);
    expect(slots.some((s) => s.startMinute === H("14:00"))).toBe(false);
  });

  it("hides slots inside the lead time on the same day", () => {
    const slots = freeSlots({
      offering: COURT,
      date: TUESDAY,
      resourceIds: ["c1"],
      hours,
      busy: [],
      blocked: [],
      horizon: { ...horizon, now: new Date("2026-04-07T10:30:00+08:00") }, // lead 60 → earliest 11:30
    });
    expect(times(slots.map((s) => s.startMinute))).toEqual(["13:00", "14:00"]);
  });

  it("returns nothing on a closed day or past the horizon", () => {
    const sunday = freeSlots({ offering: COURT, date: "2026-04-05", resourceIds: ["c1"], hours, busy: [], blocked: [], horizon });
    expect(sunday).toEqual([]);
    const farWednesday = freeSlots({
      offering: COURT,
      date: "2026-07-01",
      resourceIds: ["c1"],
      hours,
      busy: [],
      blocked: [],
      horizon,
    });
    expect(farWednesday).toEqual([]);
  });

  describe("timezone edges", () => {
    it("computes the local weekday, not the UTC one", () => {
      // 00:00–02:00 Manila on Wednesday is still Tuesday in UTC.
      const lateHours: HoursRow[] = [{ resourceId: null, weekday: 3, openMinute: 0, closeMinute: H("02:00") }];
      const slots = freeSlots({
        offering: COURT,
        date: "2026-04-08",
        resourceIds: ["c1"],
        hours: lateHours,
        busy: [],
        blocked: [],
        horizon,
      });
      expect(slots.map((s) => s.startAt.toISOString())).toEqual(["2026-04-07T16:00:00.000Z", "2026-04-07T17:00:00.000Z"]);
    });

    it("skips nonexistent local times on a spring-forward day", () => {
      const nyHours: HoursRow[] = [{ resourceId: null, weekday: 0, openMinute: H("01:00"), closeMinute: H("05:00") }];
      const slots = freeSlots({
        offering: COURT,
        date: "2026-03-08",
        resourceIds: ["c1"],
        hours: nyHours,
        busy: [],
        blocked: [],
        horizon: { now: new Date("2026-03-01T00:00:00Z"), timeZone: "America/New_York", leadTimeMin: 0, maxAdvanceDays: 30 },
      });
      // 02:00 doesn't exist. 01:00 ends at 03:00 local (one real hour later).
      expect(times(slots.map((s) => s.startMinute))).toEqual(["01:00", "03:00", "04:00"]);
    });

    it("drops a slot whose real end runs past closing across the DST jump", () => {
      const nyHours: HoursRow[] = [{ resourceId: null, weekday: 0, openMinute: H("01:30"), closeMinute: H("03:30") }];
      const slots = freeSlots({
        offering: { durationMin: 90, slotStepMin: 30, bufferMin: 0 },
        date: "2026-03-08",
        resourceIds: ["c1"],
        hours: nyHours,
        busy: [],
        blocked: [],
        horizon: { now: new Date("2026-03-01T00:00:00Z"), timeZone: "America/New_York", leadTimeMin: 0, maxAdvanceDays: 30 },
      });
      // Grid says 01:30–03:00 and 02:00–03:30. 01:30 + 90 real minutes = 04:00 local > 03:30.
      // 02:00 doesn't exist. Nothing fits.
      expect(slots).toEqual([]);
    });
  });
});
