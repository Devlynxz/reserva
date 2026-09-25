import { describe, expect, it } from "vitest";
import {
  Decimal,
  MoneyError,
  currencyDigits,
  formatMoney,
  fromMinorUnits,
  isSupportedCurrency,
  money,
  percentOf,
  roundMoney,
  sum,
  toAmountString,
  toMinorUnits,
} from "../money";

describe("money()", () => {
  it("accepts decimal strings, integers, Decimals and Decimal-likes", () => {
    expect(money("1250.50").toString()).toBe("1250.5");
    expect(money(" 7 ").toString()).toBe("7");
    expect(money(-3).toString()).toBe("-3");
    expect(money(new Decimal("0.1")).toString()).toBe("0.1");
    // e.g. Prisma's Decimal, a different decimal.js clone
    expect(money({ toString: () => "99.99" }).toString()).toBe("99.99");
  });

  it("refuses floats, which are already inexact", () => {
    expect(() => money(0.1)).toThrow(MoneyError);
    expect(() => money(Number.NaN)).toThrow(MoneyError);
    expect(() => money(2 ** 60)).toThrow(/as strings/);
  });

  it.each(["", "abc", "1e5", ".5", "1.", "+1", "1,000", "NaN"])("rejects %j", (text) => {
    expect(() => money(text)).toThrow(MoneyError);
  });

  it("keeps decimal arithmetic exact", () => {
    expect(money("0.1").plus(money("0.2")).toString()).toBe("0.3");
  });
});

describe("currencyDigits / isSupportedCurrency", () => {
  it("reads minor-unit digits from Intl", () => {
    expect(currencyDigits("PHP")).toBe(2);
    expect(currencyDigits("USD")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
    expect(currencyDigits("PHP")).toBe(2); // cached path
  });

  it("rejects malformed and unknown codes", () => {
    expect(() => currencyDigits("php")).toThrow(/ISO-4217/);
    expect(() => currencyDigits("ZZZZ")).toThrow(/ISO-4217/);
    expect(() => currencyDigits("ZZZ")).toThrow(/Unknown currency/);
  });

  it("supports only currencies that fit Decimal(12,2)", () => {
    expect(isSupportedCurrency("PHP")).toBe(true);
    expect(isSupportedCurrency("JPY")).toBe(true);
    expect(isSupportedCurrency("KWD")).toBe(false);
    expect(isSupportedCurrency("nope")).toBe(false);
  });
});

describe("roundMoney", () => {
  it("rounds half up to the currency's minor unit", () => {
    expect(roundMoney("1.005", "PHP").toString()).toBe("1.01");
    expect(roundMoney("1.004", "PHP").toString()).toBe("1");
    expect(roundMoney("2.5", "JPY").toString()).toBe("3");
    expect(roundMoney("-1.005", "PHP").toString()).toBe("-1.01"); // half away from zero
  });

  it("is unaffected by the global decimal.js rounding mode", async () => {
    const Global = (await import("decimal.js")).default;
    const previous = Global.rounding;
    Global.set({ rounding: Global.ROUND_DOWN });
    try {
      expect(roundMoney("1.005", "PHP").toString()).toBe("1.01");
    } finally {
      Global.set({ rounding: previous });
    }
  });
});

describe("sum / percentOf", () => {
  it("sums mixed inputs exactly", () => {
    expect(sum(["0.10", "0.20", 3, new Decimal("1.7")]).toString()).toBe("5");
    expect(sum([]).toString()).toBe("0");
  });

  it("takes a rounded percentage", () => {
    expect(percentOf("12500", "50", "PHP").toString()).toBe("6250");
    expect(percentOf("999.99", "30", "PHP").toString()).toBe("300"); // 299.997 → 300.00
    expect(percentOf("333.33", "12.5", "PHP").toString()).toBe("41.67"); // 41.66625
    expect(percentOf("1001", "50", "JPY").toString()).toBe("501"); // 500.5 → 501
  });
});

describe("minor units", () => {
  it("converts rounded amounts both ways", () => {
    expect(toMinorUnits("1250.50", "PHP")).toBe(125050);
    expect(toMinorUnits(3000, "JPY")).toBe(3000);
    expect(fromMinorUnits(125050, "PHP").toString()).toBe("1250.5");
    expect(fromMinorUnits(3000, "JPY").toString()).toBe("3000");
    expect(toMinorUnits(fromMinorUnits(99, "USD"), "USD")).toBe(99);
  });

  it("refuses to round implicitly", () => {
    expect(() => toMinorUnits("10.005", "PHP")).toThrow(/more decimals/);
    expect(() => toMinorUnits("10.5", "JPY")).toThrow(/more decimals/);
  });

  it("refuses unsafe sizes and non-integers", () => {
    expect(() => toMinorUnits("99999999999999999999", "PHP")).toThrow(/too large/);
    expect(() => fromMinorUnits(1.5, "PHP")).toThrow(/integer/);
  });
});

describe("formatting", () => {
  it("renders fixed-scale strings for storage", () => {
    expect(toAmountString("1250.5", "PHP")).toBe("1250.50");
    expect(toAmountString(7, "PHP")).toBe("7.00");
    expect(toAmountString("7.5", "JPY")).toBe("8");
  });

  it("formats for display without going through a float", () => {
    expect(formatMoney("1250.5", "PHP")).toBe("₱1,250.50");
    expect(formatMoney("9007199254740993.01", "USD", "en-US")).toBe("$9,007,199,254,740,993.01");
    expect(formatMoney(1500, "JPY", "en-US")).toBe("¥1,500");
  });

  it("drops a zero fraction for price tags only when asked", () => {
    expect(formatMoney("12000", "PHP", "en-PH", { wholeUnits: true })).toBe("₱12,000");
    expect(formatMoney("12000.5", "PHP", "en-PH", { wholeUnits: true })).toBe("₱12,000.50");
    expect(formatMoney("12000", "PHP")).toBe("₱12,000.00");
  });
});
