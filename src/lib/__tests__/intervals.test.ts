import { describe, expect, it } from "vitest";
import { bookingSpan, contains, isEmpty, mergeIntervals, occupied, overlaps } from "../intervals";

const at = (hhmm: string) => new Date(`2026-03-10T${hhmm}:00Z`);
const iv = (a: string, b: string) => ({ start: at(a), end: at(b) });

describe("overlaps — same semantics as tstzrange '[)' &&", () => {
  it("detects real overlap and containment", () => {
    expect(overlaps(iv("10:00", "11:00"), iv("10:30", "11:30"))).toBe(true);
    expect(overlaps(iv("10:00", "12:00"), iv("10:30", "11:00"))).toBe(true);
  });

  it("lets back-to-back ranges touch", () => {
    expect(overlaps(iv("10:00", "11:00"), iv("11:00", "12:00"))).toBe(false);
    expect(overlaps(iv("11:00", "12:00"), iv("10:00", "11:00"))).toBe(false);
  });

  it("never overlaps with an empty range", () => {
    expect(isEmpty(iv("10:00", "10:00"))).toBe(true);
    expect(overlaps(iv("10:30", "10:30"), iv("10:00", "11:00"))).toBe(false);
    expect(overlaps(iv("10:00", "11:00"), iv("11:00", "10:00"))).toBe(false);
  });
});

describe("contains", () => {
  it("is inclusive at both ends", () => {
    expect(contains(iv("08:00", "17:00"), iv("08:00", "17:00"))).toBe(true);
    expect(contains(iv("08:00", "17:00"), iv("07:59", "09:00"))).toBe(false);
    expect(contains(iv("08:00", "17:00"), iv("16:00", "17:01"))).toBe(false);
  });
});

describe("mergeIntervals", () => {
  it("sorts, merges overlapping and touching ranges, and drops empty ones", () => {
    const merged = mergeIntervals([
      iv("13:00", "14:00"),
      iv("09:00", "10:00"),
      iv("10:00", "11:00"),
      iv("09:30", "09:45"),
      iv("12:00", "12:00"),
      iv("13:30", "15:00"),
    ]);
    expect(merged.map((i) => [i.start.toISOString().slice(11, 16), i.end.toISOString().slice(11, 16)])).toEqual([
      ["09:00", "11:00"],
      ["13:00", "15:00"],
    ]);
  });

  it("doesn't mutate its input", () => {
    const input = [iv("09:00", "10:00"), iv("09:30", "11:00")];
    mergeIntervals(input);
    expect(input[0]?.end).toEqual(at("10:00"));
  });
});

describe("bookingSpan", () => {
  it("adds the buffer after the end", () => {
    const span = bookingSpan(at("10:00"), at("10:45"), 15);
    expect(span.occupiedUntil).toEqual(at("11:00"));
    expect(occupied(span)).toEqual({ start: at("10:00"), end: at("11:00") });
    expect(bookingSpan(at("10:00"), at("11:00"), 0).occupiedUntil).toEqual(at("11:00"));
  });

  it("rejects inverted spans and bad buffers", () => {
    expect(() => bookingSpan(at("11:00"), at("10:00"), 0)).toThrow(RangeError);
    expect(() => bookingSpan(at("10:00"), at("10:00"), 0)).toThrow(RangeError);
    expect(() => bookingSpan(at("10:00"), at("11:00"), -5)).toThrow(RangeError);
    expect(() => bookingSpan(at("10:00"), at("11:00"), 2.5)).toThrow(RangeError);
  });
});
