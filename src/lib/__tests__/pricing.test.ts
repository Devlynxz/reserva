import { describe, expect, it } from "vitest";
import { type PricingOffering, type PricingOverride, PricingError, pickOverride, quote, toPriceBreakdown } from "../pricing";

const OVERNIGHT: PricingOffering = {
  id: "overnight",
  basePrice: "12000",
  weekendPrice: "15000",
  includedGuests: 10,
  maxGuests: 20,
  extraGuestFee: "350",
};

const base = {
  offering: OVERNIGHT,
  resourceId: "villa",
  guestCount: 10,
  overrides: [] as PricingOverride[],
  weekendDays: [5, 6], // Friday and Saturday nights
  depositPercent: "50",
  currency: "PHP",
};

// 2026-04-07 Tue · 2026-04-10 Fri · 2026-04-11 Sat · 2026-03-29..04-04 = Holy Week
const override = (o: Partial<PricingOverride> & Pick<PricingOverride, "id">): PricingOverride => ({
  label: o.id,
  resourceId: null,
  offeringId: null,
  startDate: "2026-03-29",
  endDate: "2026-04-05",
  fixedPrice: null,
  multiplier: "1.5",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...o,
});

describe("quote — the pricing pipeline", () => {
  it("uses the base price on a weekday", () => {
    const q = quote({ ...base, date: "2026-04-07" });
    expect(q.total.toString()).toBe("12000");
    expect(q.deposit.toString()).toBe("6000");
    expect(q.isWeekend).toBe(false);
    expect(q.override).toBeNull();
    expect(q.lines).toEqual([{ kind: "base", label: "Base price", amount: "12000.00" }]);
  });

  it("switches to the weekend price on a weekend start date", () => {
    const q = quote({ ...base, date: "2026-04-10" });
    expect(q.isWeekend).toBe(true);
    expect(q.basePrice.toString()).toBe("15000");
    expect(q.lines.map((l) => l.kind)).toEqual(["base", "weekend"]);
  });

  it("keeps the base price on a weekend when there's no weekend price", () => {
    const q = quote({ ...base, offering: { ...OVERNIGHT, weekendPrice: null }, date: "2026-04-11" });
    expect(q.isWeekend).toBe(true);
    expect(q.total.toString()).toBe("12000");
  });

  it("applies a multiplier override on top of the weekend price", () => {
    const q = quote({ ...base, date: "2026-04-03", overrides: [override({ id: "holy-week", label: "Holy Week" })] });
    expect(q.basePrice.toString()).toBe("22500"); // 15000 (Friday) × 1.5
    expect(q.override).toEqual({ id: "holy-week", label: "Holy Week" });
    expect(q.lines.at(-1)).toEqual({ kind: "override", label: "Holy Week", amount: "22500.00" });
  });

  it("lets a fixed-price override replace the price entirely", () => {
    const q = quote({
      ...base,
      date: "2026-04-01",
      overrides: [override({ id: "fixed", fixedPrice: "18000", multiplier: null })],
    });
    expect(q.basePrice.toString()).toBe("18000");
  });

  it("rounds multiplied prices half up", () => {
    const q = quote({
      ...base,
      offering: { ...OVERNIGHT, basePrice: "999.99" },
      date: "2026-04-01",
      overrides: [override({ id: "odd", multiplier: "1.115" })],
    });
    expect(q.basePrice.toString()).toBe("1114.99"); // 1114.988…
  });

  it("charges extra guests above the included count", () => {
    const q = quote({ ...base, date: "2026-04-07", guestCount: 13 });
    expect(q.extraGuests).toBe(3);
    expect(q.extraGuestsAmount.toString()).toBe("1050");
    expect(q.total.toString()).toBe("13050");
    expect(q.deposit.toString()).toBe("6525");
    expect(q.lines.at(-1)).toEqual({
      kind: "extra_guests",
      label: "3 extra guests",
      quantity: 3,
      unitAmount: "350.00",
      amount: "1050.00",
    });
    expect(quote({ ...base, date: "2026-04-07", guestCount: 11 }).lines.at(-1)?.label).toBe("1 extra guest");
  });

  it("rounds the deposit half up", () => {
    const q = quote({ ...base, offering: { ...OVERNIGHT, basePrice: "999.99" }, date: "2026-04-07", depositPercent: "30" });
    expect(q.deposit.toString()).toBe("300"); // 299.997
  });

  it("allows a 100% deposit (pay in full)", () => {
    expect(quote({ ...base, date: "2026-04-07", depositPercent: 100 }).deposit.toString()).toBe("12000");
  });

  it("works for zero-decimal currencies", () => {
    const q = quote({ ...base, date: "2026-04-07", currency: "JPY", offering: { ...OVERNIGHT, basePrice: "10001" } });
    expect(q.deposit.toString()).toBe("5001"); // 5000.5 → 5001
  });

  describe("guards", () => {
    it.each([0, -1, 1.5])("rejects a guest count of %s", (guestCount) => {
      expect(() => quote({ ...base, date: "2026-04-07", guestCount })).toThrow(expect.objectContaining({ code: "too_few_guests" }));
    });

    it("rejects more guests than the package allows", () => {
      expect(() => quote({ ...base, date: "2026-04-07", guestCount: 21 })).toThrow(
        expect.objectContaining({ code: "too_many_guests" }),
      );
    });

    it.each(["0", "-5", "100.01"])("rejects a %s%% deposit", (depositPercent) => {
      expect(() => quote({ ...base, date: "2026-04-07", depositPercent })).toThrow(
        expect.objectContaining({ code: "invalid_deposit_percent" }),
      );
    });

    it("rejects an invalid date", () => {
      expect(() => quote({ ...base, date: "2026-02-30" })).toThrow(PricingError);
    });

    it("rejects an override with no rule", () => {
      expect(() =>
        quote({ ...base, date: "2026-04-01", overrides: [override({ id: "empty", fixedPrice: null, multiplier: null })] }),
      ).toThrow(expect.objectContaining({ code: "invalid_input" }));
    });
  });
});

describe("pickOverride", () => {
  const ctx = { offeringId: "overnight", resourceId: "villa", date: "2026-04-02" };

  it("ignores rules for other dates, resources or offerings", () => {
    const rules = [
      override({ id: "before", startDate: "2026-03-01", endDate: "2026-04-01" }),
      override({ id: "after", startDate: "2026-04-03", endDate: "2026-04-10" }),
      override({ id: "other-resource", resourceId: "kubo" }),
      override({ id: "other-offering", offeringId: "day-tour" }),
    ];
    expect(pickOverride(rules, ctx)).toBeNull();
  });

  it("includes both ends of the date range", () => {
    expect(pickOverride([override({ id: "a", startDate: "2026-04-02", endDate: "2026-04-02" })], ctx)?.id).toBe("a");
  });

  it("prefers the most specific rule: resource+offering > offering > resource > global", () => {
    const rules = [
      override({ id: "global" }),
      override({ id: "resource", resourceId: "villa" }),
      override({ id: "offering", offeringId: "overnight" }),
      override({ id: "both", resourceId: "villa", offeringId: "overnight" }),
    ];
    expect(pickOverride(rules, ctx)?.id).toBe("both");
    expect(pickOverride(rules.slice(0, 3), ctx)?.id).toBe("offering");
    expect(pickOverride(rules.slice(0, 2), ctx)?.id).toBe("resource");
    expect(pickOverride(rules.slice(0, 1), ctx)?.id).toBe("global");
  });

  it("breaks ties by newest rule, then by id", () => {
    const older = override({ id: "b-old", createdAt: new Date("2026-01-01") });
    const newer = override({ id: "z-new", createdAt: new Date("2026-02-01") });
    expect(pickOverride([older, newer], ctx)?.id).toBe("z-new");
    const twinA = override({ id: "a" });
    const twinB = override({ id: "b" });
    expect(pickOverride([twinB, twinA], ctx)?.id).toBe("a");
  });
});

describe("toPriceBreakdown", () => {
  it("is plain JSON with fixed-scale amounts", () => {
    const q = quote({ ...base, date: "2026-04-03", guestCount: 12, overrides: [override({ id: "hw", label: "Holy Week" })] });
    const snapshot = toPriceBreakdown(q);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual({
      currency: "PHP",
      lines: [
        { kind: "base", label: "Base price", amount: "12000.00" },
        { kind: "weekend", label: "Weekend rate", amount: "15000.00" },
        { kind: "override", label: "Holy Week", amount: "22500.00" },
        { kind: "extra_guests", label: "2 extra guests", quantity: 2, unitAmount: "350.00", amount: "700.00" },
      ],
      total: "23200.00",
      depositPercent: "50",
      deposit: "11600.00",
      override: { id: "hw", label: "Holy Week" },
    });
  });
});
