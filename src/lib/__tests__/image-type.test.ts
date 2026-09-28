import { describe, expect, it } from "vitest";
import { APP_ICON_SIZE, checkAppIcon, detectImageType, pngSize } from "../image-type";

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

/** A PNG signature followed by an IHDR chunk header for the given size (enough for pngSize). */
function pngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(24);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  out.set([0, 0, 0, 13], 8); // IHDR data length
  out.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(out.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return out;
}

describe("pngSize", () => {
  it("reads width and height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(512, 512))).toEqual({ width: 512, height: 512 });
    expect(pngSize(pngHeader(1200, 630))).toEqual({ width: 1200, height: 630 });
  });

  it("returns null for non-PNGs, truncated PNGs and a missing IHDR", () => {
    expect(pngSize(bytes(0xff, 0xd8, 0xff, 0xe0))).toBeNull();
    expect(pngSize(pngHeader(512, 512).slice(0, 20))).toBeNull();
    const noIhdr = pngHeader(512, 512);
    noIhdr.set(ascii("IDAT"), 12);
    expect(pngSize(noIhdr)).toBeNull();
  });
});

describe("checkAppIcon", () => {
  it("accepts a 512 × 512 PNG", () => {
    expect(APP_ICON_SIZE).toBe(512);
    expect(checkAppIcon(pngHeader(512, 512))).toBeNull();
  });

  it("refuses other sizes and says what it got", () => {
    expect(checkAppIcon(pngHeader(1024, 1024))).toBe("Use a square PNG of exactly 512 × 512 pixels (this one is 1024 × 1024).");
    expect(checkAppIcon(pngHeader(512, 256))).toBe("Use a square PNG of exactly 512 × 512 pixels (this one is 512 × 256).");
  });

  it("refuses JPEG, WebP, SVG and junk", () => {
    const message = "Use a PNG image for the app icon.";
    expect(checkAppIcon(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(message);
    expect(checkAppIcon(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe(message);
    expect(checkAppIcon(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(message);
    expect(checkAppIcon(new Uint8Array())).toBe(message);
  });
});
