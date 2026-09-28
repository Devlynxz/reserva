import { describe, expect, it } from "vitest";
import { brandMark, isStoredAssetUrl, siteIcons } from "../brand-assets";

const BLOB = "https://abc123.public.blob.vercel-storage.com/logos/logo-1a2b.png";
const ICON = "https://abc123.public.blob.vercel-storage.com/icons/icon-3c4d.png";

describe("isStoredAssetUrl", () => {
  it("accepts https URLs on our Vercel Blob store", () => {
    expect(isStoredAssetUrl(BLOB)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "",
    "not a url",
    "http://abc123.public.blob.vercel-storage.com/logo.png",
    "https://evil.example/logo.png",
    "https://public.blob.vercel-storage.com.evil.example/logo.png",
    "https://user:pass@abc123.public.blob.vercel-storage.com/logo.png",
    "https://:pass@abc123.public.blob.vercel-storage.com/logo.png",
    "javascript:alert(1)",
  ])("refuses %s", (url) => {
    expect(isStoredAssetUrl(url)).toBe(false);
  });
});

describe("brandMark", () => {
  const name = "Villa Serena";

  it("prefers the logo", () => {
    expect(brandMark({ businessName: name, logoUrl: BLOB, iconUrl: ICON })).toEqual({ kind: "logo", src: BLOB, name });
  });

  it("falls back to icon + name, then name", () => {
    expect(brandMark({ businessName: name, logoUrl: null, iconUrl: ICON })).toEqual({ kind: "icon", src: ICON, name });
    expect(brandMark({ businessName: name, logoUrl: null, iconUrl: null })).toEqual({ kind: "name", name });
  });

  it("ignores URLs that aren't our stored assets", () => {
    expect(brandMark({ businessName: name, logoUrl: "https://evil.example/x.png", iconUrl: "http://x" })).toEqual({ kind: "name", name });
  });
});

describe("siteIcons", () => {
  it("uses the Reserva kit icons by default", () => {
    const icons = siteIcons(null);
    expect(icons.icon.map((i) => i.sizes)).toEqual(["16x16", "32x32", "48x48"]);
    expect(icons.icon[0]?.url).toBe("/brand/icons/favicon-16.png");
    expect(icons.apple).toEqual({ url: "/brand/icons/apple-touch-icon.png", sizes: "180x180" });
    expect(icons.manifest.map((i) => i.src)).toEqual([
      "/brand/icons/icon-192.png",
      "/brand/icons/icon-512.png",
      "/brand/icons/icon-maskable-512.png",
    ]);
    expect(icons.manifest[2]?.purpose).toBe("maskable");
  });

  it("uses the owner's 512 × 512 icon everywhere when set, never as maskable", () => {
    const icons = siteIcons(ICON);
    expect(icons.icon).toEqual([{ url: ICON, sizes: "512x512", type: "image/png" }]);
    expect(icons.apple).toEqual({ url: ICON, sizes: "512x512" });
    expect(icons.manifest).toEqual([{ src: ICON, sizes: "512x512", type: "image/png" }]);
  });

  it("ignores an icon URL that isn't a stored asset", () => {
    expect(siteIcons("https://evil.example/icon.png")).toEqual(siteIcons(null));
  });
});
