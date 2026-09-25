import { describe, expect, it } from "vitest";
import { escapeCsvCell, toCsv } from "../csv";

describe("escapeCsvCell", () => {
  it("passes plain values through", () => {
    expect(escapeCsvCell("Maria Santos")).toBe("Maria Santos");
    expect(escapeCsvCell("1250.00")).toBe("1250.00");
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(-5)).toBe("-5"); // real numbers are never "neutralized"
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(false)).toBe("false");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(escapeCsvCell("Santos, Maria")).toBe('"Santos, Maria"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
  });

  it.each([
    ['=HYPERLINK("http://evil.example","click")', `"'=HYPERLINK(""http://evil.example"",""click"")"`],
    ["+639171234567", "'+639171234567"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\t=1+1", "'\t=1+1"],
    ["\r=1+1", `"'\r=1+1"`],
  ])("neutralizes formula-like text %j", (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("refuses non-finite numbers", () => {
    expect(() => escapeCsvCell(Number.NaN)).toThrow(RangeError);
    expect(() => escapeCsvCell(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF and ends with a newline", () => {
    expect(toCsv([["a", "b"], [1, null]])).toBe("a,b\r\n1,\r\n");
  });

  it("can prepend a BOM for Excel", () => {
    expect(toCsv([["₱"]], { bom: true })).toBe("﻿₱\r\n");
  });
});
