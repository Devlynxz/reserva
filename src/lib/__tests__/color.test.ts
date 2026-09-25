import { describe, expect, it } from "vitest";
import { brandCssVars, contrastRatio, normalizeHex, readableTextOn } from "../color";

describe("normalizeHex", () => {
  it.each([
    ["#0E7C86", "#0e7c86"],
    ["0e7c86", "#0e7c86"],
    ["#abc", "#aabbcc"],
    ["  #FFF  ", "#ffffff"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeHex(input)).toBe(expected);
  });

  it.each(["", "#12", "#1234", "#ggg000", "red", "#fff;}body{display:none", "url(x)"])("rejects %j", (input) => {
    expect(normalizeHex(input)).toBeNull();
  });
});

describe("contrast", () => {
  it("matches the WCAG extremes", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("picks readable text for dark and light brands", () => {
    expect(readableTextOn("#0e7c86")).toBe("#ffffff");
    expect(readableTextOn("#1e3a8a")).toBe("#ffffff");
    expect(readableTextOn("#facc15")).toBe("#0f1720");
    expect(readableTextOn("#a7f3d0")).toBe("#0f1720");
  });
});

describe("brandCssVars", () => {
  it("emits both variables for a valid color", () => {
    expect(brandCssVars("#facc15", "#0e7c86")).toBe("--brand:#facc15;--brand-contrast:#0f1720;");
  });

  it("falls back instead of interpolating an unsafe value", () => {
    const css = brandCssVars("red;}</style><script>alert(1)</script>", "#0e7c86");
    expect(css).toBe("--brand:#0e7c86;--brand-contrast:#ffffff;");
  });
});
