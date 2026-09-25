import { describe, expect, it } from "vitest";
import { detectImageType } from "../image-type";

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)));

describe("detectImageType", () => {
  it("recognizes PNG, JPEG and WebP by their signatures", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toEqual({ ext: "png", mime: "image/png" });
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ ext: "jpg", mime: "image/jpeg" });
    expect(detectImageType(ascii("RIFF\0\0\0\0WEBPVP8 "))).toEqual({ ext: "webp", mime: "image/webp" });
  });

  it("refuses SVG, HTML, other RIFF files, and truncated data", () => {
    expect(detectImageType(ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(detectImageType(ascii("<!doctype html>"))).toBeNull();
    expect(detectImageType(ascii("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
    expect(detectImageType(bytes(0x89, 0x50))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
