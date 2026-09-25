import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  formatClock,
  formatDuration,
  formatLocalDate,
  formatLongDate,
  formatMinuteOfDay,
  formatMonth,
  formatRange,
  formatShortDate,
} from "../display";

const MANILA = "Asia/Manila";
const L = "en-PH";
// Normalize the narrow no-break space some ICU versions put before AM/PM.
const n = (s: string) => s.replace(/ /g, " ");

describe("instants in the business timezone", () => {
  const instant = new Date("2030-04-05T11:00:00Z"); // 7:00 PM in Manila

  it("formats clock times and dates in Manila time", () => {
    expect(n(formatClock(instant, MANILA, L))).toBe("7:00 PM");
    expect(formatShortDate(instant, MANILA, L)).toBe("Fri, Apr 5");
    expect(formatLongDate(instant, MANILA, L)).toBe("Friday, April 5, 2030");
  });

  it("uses the local date, not the UTC one, near midnight", () => {
    expect(formatShortDate(new Date("2030-04-05T16:30:00Z"), MANILA, L)).toBe("Sat, Apr 6");
  });

  it("reuses formatters", () => {
    expect(n(formatClock(instant, MANILA, L))).toBe(n(formatClock(instant, MANILA, L)));
  });
});

describe("calendar values", () => {
  it("formats a LocalDate without shifting it", () => {
    expect(formatLocalDate("2030-04-05", L)).toBe("Friday, April 5, 2030");
    expect(formatLocalDate("2030-04-05", L, "short")).toBe("Fri, Apr 5");
    expect(formatMonth("2030-04", L)).toBe("April 2030");
  });

  it("formats minutes of day", () => {
    expect(n(formatMinuteOfDay(8 * 60, L))).toBe("8:00 AM");
    expect(n(formatMinuteOfDay(19 * 60 + 30, L))).toBe("7:30 PM");
    expect(n(formatMinuteOfDay(1440, L))).toBe("12:00 AM");
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(150)).toBe("2 hr 30 min");
  });
});

describe("describeSchedule", () => {
  const window = { mode: "WINDOW" as const, durationMin: null };

  it("describes windows, including overnight ones", () => {
    expect(n(describeSchedule({ ...window, startMinute: 480, endMinute: 1020, endsNextDay: false }, L))).toBe("8:00 AM to 5:00 PM");
    expect(n(describeSchedule({ ...window, startMinute: 1140, endMinute: 420, endsNextDay: true }, L))).toBe(
      "7:00 PM to 7:00 AM the next day",
    );
  });

  it("describes slots by duration", () => {
    expect(describeSchedule({ mode: "SLOT", startMinute: null, endMinute: null, endsNextDay: false, durationMin: 45 }, L)).toBe("45 min");
  });

  it("tolerates missing fields", () => {
    expect(describeSchedule({ mode: "SLOT", startMinute: null, endMinute: null, endsNextDay: false, durationMin: null }, L)).toBe("0 min");
    expect(n(describeSchedule({ ...window, startMinute: null, endMinute: null, endsNextDay: false }, L))).toBe("12:00 AM to 12:00 AM");
  });
});

describe("formatRange", () => {
  it("keeps same-day ranges short", () => {
    const range = formatRange(new Date("2030-04-05T02:00:00Z"), new Date("2030-04-05T03:00:00Z"), MANILA, L);
    expect(n(range)).toBe("Fri, Apr 5, 10:00 AM to 11:00 AM");
  });

  it("spells out both dates for overnight ranges", () => {
    const range = formatRange(new Date("2030-04-05T11:00:00Z"), new Date("2030-04-05T23:00:00Z"), MANILA, L);
    expect(n(range)).toBe("Fri, Apr 5, 7:00 PM to Sat, Apr 6, 7:00 AM");
  });
});
