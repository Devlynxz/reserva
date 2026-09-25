import { describe, expect, it } from "vitest";
import {
  REFERENCE_ALPHABET,
  generateReferenceCode,
  isReferenceCode,
  normalizeReferenceCode,
} from "../reference-code";

/** Deterministic byte source that replays a fixed sequence. */
function replay(bytes: number[]) {
  let i = 0;
  return (length: number) => Uint8Array.from({ length }, () => bytes[i++ % bytes.length]!);
}

describe("alphabet", () => {
  it("has 31 unique symbols and none of the easily confused ones", () => {
    expect(new Set(REFERENCE_ALPHABET).size).toBe(31);
    for (const ambiguous of "0O1IL") expect(REFERENCE_ALPHABET).not.toContain(ambiguous);
  });
});

describe("generateReferenceCode", () => {
  it("formats RSV-XXXXX from the alphabet", () => {
    for (let i = 0; i < 500; i++) expect(generateReferenceCode()).toMatch(/^RSV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
  });

  it("maps bytes to symbols deterministically", () => {
    expect(generateReferenceCode(replay([0, 1, 2, 3, 30]))).toBe("RSV-2345Z");
  });

  it("discards biased bytes (≥ 248) instead of wrapping them", () => {
    // 248..255 would map onto the first 8 symbols more often than the rest.
    expect(generateReferenceCode(replay([248, 255, 0, 250, 31, 62, 93, 124]))).toBe("RSV-22222");
  });

  it("keeps drawing when a whole batch is rejected", () => {
    const bytes = [...Array(10).fill(255), 5, 6, 7, 8, 9];
    expect(generateReferenceCode(replay(bytes))).toBe("RSV-789AB");
  });

  it("is roughly uniform", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 6200; i++) {
      for (const ch of generateReferenceCode().slice(4)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    // 31,000 symbols / 31 = 1000 expected each; allow generous noise.
    for (const count of counts.values()) expect(count).toBeGreaterThan(800);
    expect(counts.size).toBe(31);
  });
});

describe("normalizeReferenceCode", () => {
  it.each([
    ["RSV-7K3Q9", "RSV-7K3Q9"],
    ["rsv-7k3q9", "RSV-7K3Q9"],
    [" rsv 7k3q9 ", "RSV-7K3Q9"],
    ["RSV7K3Q9", "RSV-7K3Q9"],
    ["7K3Q9", "RSV-7K3Q9"],
    ["7k-3q9", "RSV-7K3Q9"],
  ])("normalizes %j", (input, expected) => {
    expect(normalizeReferenceCode(input)).toBe(expected);
  });

  it.each(["", "RSV-7K3Q", "RSV-7K3Q9X", "RSV-0K3Q9", "RSV-7K3QO", "ABC-7K3Q9", "RSV-7K3Q!", "RSVRSV"])("rejects %j", (input) => {
    expect(normalizeReferenceCode(input)).toBeNull();
  });
});

describe("isReferenceCode", () => {
  it("accepts only the canonical form", () => {
    expect(isReferenceCode("RSV-7K3Q9")).toBe(true);
    expect(isReferenceCode("rsv-7k3q9")).toBe(false);
    expect(isReferenceCode("7K3Q9")).toBe(false);
  });
});
