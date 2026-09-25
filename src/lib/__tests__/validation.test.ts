import { describe, expect, it } from "vitest";
import {
  amountSchema,
  availabilityQuerySchema,
  blockedPeriodInputSchema,
  bookingRequestSchema,
  bookingSelectionSchema,
  bookingStatusSchema,
  businessHoursInputSchema,
  currencySchema,
  emailSchema,
  hexColorSchema,
  lookupSchema,
  manualBookingSchema,
  modeFieldError,
  offeringInputSchema,
  phoneSchema,
  pricingOverrideInputSchema,
  recordPaymentSchema,
  resourceInputSchema,
  settingsInputSchema,
  slugSchema,
  timeSchema,
  timeZoneSchema,
} from "../validation";

const ID = "0196b0c4-7a2e-7cc1-9a5e-2f4b8c1d3e5f";
const ID2 = "0196b0c4-7a2e-7cc1-9a5e-2f4b8c1d3e60";

const firstMessage = (result: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  result.error?.issues[0]?.message;

describe("primitives", () => {
  it("normalizes emails", () => {
    expect(emailSchema.parse("  Maria@Example.COM ")).toBe("maria@example.com");
    expect(emailSchema.safeParse("maria@").success).toBe(false);
    expect(emailSchema.safeParse(`${"a".repeat(250)}@x.co`).success).toBe(false);
  });

  it("accepts common phone formats only", () => {
    for (const ok of ["0917 123 4567", "+63 917 123 4567", "(02) 8123-4567"]) expect(phoneSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["123", "call me", "0917<script>"]) expect(phoneSchema.safeParse(bad).success).toBe(false);
  });

  it("parses times to minutes of day", () => {
    expect(timeSchema.parse("19:30")).toBe(1170);
    expect(timeSchema.parse("24:00")).toBe(1440);
    expect(timeSchema.safeParse("24:30").success).toBe(false);
    expect(timeSchema.safeParse("7:30").success).toBe(false);
  });

  it("validates slugs, amounts, currencies, zones and colors", () => {
    expect(slugSchema.safeParse("day-tour").success).toBe(true);
    expect(slugSchema.safeParse("Day Tour").success).toBe(false);
    expect(slugSchema.safeParse("day--tour").success).toBe(false);

    expect(amountSchema.safeParse("2500.50").success).toBe(true);
    for (const bad of ["-1", "2500.505", "1e3", "12345678901", ""]) expect(amountSchema.safeParse(bad).success).toBe(false);

    expect(currencySchema.parse(" php ")).toBe("PHP");
    expect(currencySchema.safeParse("KWD").success).toBe(false); // 3 decimals won't fit Decimal(12,2)
    expect(timeZoneSchema.safeParse("Asia/Manila").success).toBe(true);
    expect(timeZoneSchema.safeParse("Mars/Base").success).toBe(false);

    expect(hexColorSchema.parse("#0E7C86")).toBe("#0e7c86");
    expect(firstMessage(hexColorSchema.safeParse("red"))).toBe("Use a hex color like #0e7c86.");
  });
});

describe("bookingRequestSchema", () => {
  const valid = {
    offeringSlug: "overnight",
    resourceId: ID,
    date: "2026-04-04",
    guestCount: "12",
    customer: { name: " Maria Santos ", email: "Maria@Example.com", phone: "0917 123 4567" },
    notes: "  ",
  };

  it("parses and normalizes a valid request", () => {
    const parsed = bookingRequestSchema.parse(valid);
    expect(parsed).toEqual({
      offeringSlug: "overnight",
      resourceId: ID,
      date: "2026-04-04",
      guestCount: 12,
      customer: { name: "Maria Santos", email: "maria@example.com", phone: "0917 123 4567" },
      notes: undefined,
    });
  });

  it("keeps non-empty notes, trimmed", () => {
    expect(bookingRequestSchema.parse({ ...valid, notes: " Arriving late, around 21:00 " }).notes).toBe(
      "Arriving late, around 21:00",
    );
  });

  it("accepts 'any' resource and a SLOT start time", () => {
    const parsed = bookingRequestSchema.parse({ ...valid, resourceId: "any", startTime: "09:15" });
    expect(parsed.resourceId).toBe("any");
    expect(parsed.startTime).toBe(555);
  });

  it("rejects any attempt to send a price, status or source", () => {
    for (const extra of [{ price: "1" }, { totalAmount: "1" }, { status: "CONFIRMED" }, { source: "WALK_IN" }]) {
      expect(bookingRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    expect(bookingRequestSchema.safeParse({ ...valid, customer: { ...valid.customer, role: "ADMIN" } }).success).toBe(false);
  });

  it("rejects bad dates, guests and resources", () => {
    expect(bookingRequestSchema.safeParse({ ...valid, date: "2026-02-30" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, guestCount: 0 }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, guestCount: "2.5" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, resourceId: "villa-1" }).success).toBe(false);
    expect(bookingRequestSchema.safeParse({ ...valid, notes: "x".repeat(1001) }).success).toBe(false);
  });
});

describe("bookingSelectionSchema", () => {
  it("is the request without the customer, still strict", () => {
    const selection = { offeringSlug: "haircut", resourceId: "any", date: "2026-04-04", startTime: "10:00", guestCount: 1 };
    expect(bookingSelectionSchema.parse(selection)).toEqual({ ...selection, startTime: 600 });
    expect(bookingSelectionSchema.safeParse({ ...selection, price: "1" }).success).toBe(false);
  });
});

describe("modeFieldError", () => {
  it("requires a time for SLOT and forbids one for WINDOW", () => {
    expect(modeFieldError("SLOT", {})).toBe("Pick a time.");
    expect(modeFieldError("SLOT", { startTime: 540 })).toBeNull();
    expect(modeFieldError("WINDOW", { startTime: 540 })).toMatch(/fixed time/);
    expect(modeFieldError("WINDOW", {})).toBeNull();
  });
});

describe("lookupSchema", () => {
  it("normalizes the reference and email", () => {
    expect(lookupSchema.parse({ reference: "rsv 7k3q9", email: "A@B.co" })).toEqual({ reference: "RSV-7K3Q9", email: "a@b.co" });
  });

  it("explains a malformed reference", () => {
    expect(firstMessage(lookupSchema.safeParse({ reference: "RSV-0000", email: "a@b.co" }))).toBe("Enter a reference like RSV-7K3Q9.");
  });
});

describe("availabilityQuerySchema", () => {
  it("accepts a range of up to 62 days", () => {
    expect(availabilityQuerySchema.safeParse({ offering: "court", from: "2026-04-01", to: "2026-06-02" }).success).toBe(true);
  });

  it("rejects inverted and oversized ranges", () => {
    expect(firstMessage(availabilityQuerySchema.safeParse({ offering: "court", from: "2026-04-02", to: "2026-04-01" }))).toMatch(
      /must not be after/,
    );
    expect(firstMessage(availabilityQuerySchema.safeParse({ offering: "court", from: "2026-04-01", to: "2026-06-03" }))).toMatch(
      /62 days/,
    );
  });
});

describe("resourceInputSchema", () => {
  it("applies defaults and coerces numbers", () => {
    expect(resourceInputSchema.parse({ slug: "court-1", name: "Court 1", type: "SPACE", capacity: "4" })).toEqual({
      slug: "court-1",
      name: "Court 1",
      type: "SPACE",
      capacity: 4,
      isActive: true,
      sortOrder: 0,
    });
  });
});

describe("offeringInputSchema", () => {
  const common = {
    slug: "overnight",
    name: "Overnight",
    resourceIds: [ID],
    basePrice: "12000",
    includedGuests: 10,
    maxGuests: 20,
  };

  it("derives WINDOW minutes and endsNextDay", () => {
    const overnight = offeringInputSchema.parse({ ...common, mode: "WINDOW", startTime: "19:00", endTime: "07:00" });
    expect(overnight).toMatchObject({ startMinute: 1140, endMinute: 420, endsNextDay: true, bufferMin: 0, extraGuestFee: "0" });
    const dayTour = offeringInputSchema.parse({ ...common, mode: "WINDOW", startTime: "08:00", endTime: "17:00" });
    expect(dayTour).toMatchObject({ endsNextDay: false });
  });

  it("rejects a window time of 24:00", () => {
    const result = offeringInputSchema.safeParse({ ...common, mode: "WINDOW", startTime: "08:00", endTime: "24:00" });
    expect(firstMessage(result)).toBe("Use a time before 24:00.");
  });

  it("parses SLOT offerings", () => {
    const haircut = offeringInputSchema.parse({ ...common, mode: "SLOT", durationMin: "45", slotStepMin: "15", bufferMin: "15" });
    expect(haircut).toMatchObject({ mode: "SLOT", durationMin: 45, slotStepMin: 15, bufferMin: 15 });
    expect(haircut).not.toHaveProperty("startMinute");
  });

  it("rejects max guests below included guests, and missing resources", () => {
    expect(firstMessage(offeringInputSchema.safeParse({ ...common, mode: "SLOT", durationMin: 60, slotStepMin: 60, maxGuests: 5 }))).toBe(
      "Max guests can't be less than included guests.",
    );
    expect(offeringInputSchema.safeParse({ ...common, resourceIds: [], mode: "SLOT", durationMin: 60, slotStepMin: 60 }).success).toBe(
      false,
    );
  });
});

describe("businessHoursInputSchema", () => {
  it("maps times to minutes", () => {
    expect(businessHoursInputSchema.parse({ resourceId: null, weekday: "2", openTime: "09:00", closeTime: "24:00" })).toEqual({
      resourceId: null,
      weekday: 2,
      openMinute: 540,
      closeMinute: 1440,
    });
  });

  it("rejects closing before opening", () => {
    expect(firstMessage(businessHoursInputSchema.safeParse({ resourceId: ID, weekday: 1, openTime: "17:00", closeTime: "09:00" }))).toBe(
      "Closing must be after opening.",
    );
  });
});

describe("pricingOverrideInputSchema", () => {
  const rule = { label: "Holy Week", resourceId: null, offeringId: ID, startDate: "2026-03-29", endDate: "2026-04-05" };

  it("takes exactly one of fixed price or multiplier", () => {
    expect(pricingOverrideInputSchema.safeParse({ ...rule, multiplier: "1.5" }).success).toBe(true);
    expect(pricingOverrideInputSchema.safeParse({ ...rule, fixedPrice: "18000" }).success).toBe(true);
    expect(firstMessage(pricingOverrideInputSchema.safeParse(rule))).toMatch(/either a fixed price or a multiplier/);
    expect(pricingOverrideInputSchema.safeParse({ ...rule, fixedPrice: "1", multiplier: "2" }).success).toBe(false);
    expect(pricingOverrideInputSchema.safeParse({ ...rule, multiplier: "0" }).success).toBe(false);
  });

  it("rejects an inverted date range", () => {
    expect(firstMessage(pricingOverrideInputSchema.safeParse({ ...rule, endDate: "2026-03-01", multiplier: "1.5" }))).toMatch(
      /can't be before/,
    );
  });
});

describe("blockedPeriodInputSchema", () => {
  it("coerces dates and requires end after start", () => {
    const ok = blockedPeriodInputSchema.parse({ resourceId: null, startAt: "2026-04-01T00:00:00+08:00", endAt: "2026-04-02T00:00:00+08:00" });
    expect(ok.startAt.toISOString()).toBe("2026-03-31T16:00:00.000Z");
    expect(
      blockedPeriodInputSchema.safeParse({ resourceId: ID, startAt: "2026-04-02T00:00:00Z", endAt: "2026-04-02T00:00:00Z" }).success,
    ).toBe(false);
  });
});

describe("settingsInputSchema", () => {
  const settings = {
    businessName: "Villa Serena",
    brandColor: "#0e7c86",
    currency: "PHP",
    timezone: "Asia/Manila",
    depositPercent: "50",
    holdMinutes: "15",
    weekendDays: ["5", "6"],
    leadTimeMin: 60,
    maxAdvanceDays: 180,
  };

  it("parses a valid settings form", () => {
    expect(settingsInputSchema.parse(settings)).toMatchObject({ weekendDays: [5, 6], holdMinutes: 15 });
  });

  it.each(["0", "100.5", "abc"])("rejects a deposit of %s", (depositPercent) => {
    expect(settingsInputSchema.safeParse({ ...settings, depositPercent }).success).toBe(false);
  });

  it("rejects duplicate weekend days", () => {
    expect(firstMessage(settingsInputSchema.safeParse({ ...settings, weekendDays: [6, 6] }))).toBe("Each weekday once.");
  });
});

describe("manualBookingSchema", () => {
  it("defaults to a confirmed booking and rejects an ONLINE source", () => {
    const booking = {
      source: "WALK_IN",
      offeringId: ID,
      resourceId: ID2,
      date: "2026-04-04",
      guestCount: 2,
      customer: { name: "Paolo", email: "paolo@example.com" },
    };
    expect(manualBookingSchema.parse(booking).awaitingPayment).toBe(false);
    expect(manualBookingSchema.safeParse({ ...booking, source: "ONLINE" }).success).toBe(false);
  });
});

describe("status and payments", () => {
  it("knows the booking statuses", () => {
    expect(bookingStatusSchema.safeParse("CONFIRMED").success).toBe(true);
    expect(bookingStatusSchema.safeParse("PAID").success).toBe(false);
  });

  it("requires a positive recorded payment", () => {
    expect(recordPaymentSchema.safeParse({ bookingId: ID, amount: "500", method: "cash" }).success).toBe(true);
    expect(firstMessage(recordPaymentSchema.safeParse({ bookingId: ID, amount: "0", method: "cash" }))).toBe("Enter an amount above 0.");
  });
});
