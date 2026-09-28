// Which of the business's brand assets to show, and where. The owner uploads a logo and an
// app icon (Settings); until they do, the Reserva kit icons in public/brand/icons are the
// template default. Only files on our own Vercel Blob store are ever used: that's the only
// image host the CSP allows and the only place uploads go, and it means the server never
// fetches an arbitrary URL (OG image, emails).

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;

export function isStoredAssetUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

export type BrandMark =
  | { kind: "logo"; src: string; name: string }
  | { kind: "icon"; src: string; name: string }
  | { kind: "name"; name: string };

/** What the header shows for the business: its logo, else its icon and name, else its name. */
export function brandMark(brand: { businessName: string; logoUrl: string | null; iconUrl: string | null }): BrandMark {
  const name = brand.businessName;
  if (isStoredAssetUrl(brand.logoUrl)) return { kind: "logo", src: brand.logoUrl, name };
  if (isStoredAssetUrl(brand.iconUrl)) return { kind: "icon", src: brand.iconUrl, name };
  return { kind: "name", name };
}

export type SiteIcons = {
  icon: { url: string; sizes: string; type: "image/png" }[];
  apple: { url: string; sizes: string };
  manifest: { src: string; sizes: string; type: "image/png"; purpose?: "maskable" }[];
};

const KIT = "/brand/icons";

/** Favicon, Apple touch icon and manifest icons for the business. */
export function siteIcons(iconUrl: string | null): SiteIcons {
  if (isStoredAssetUrl(iconUrl)) {
    // One 512 × 512 PNG (enforced at upload); browsers scale it. Not "maskable": an
    // owner's icon isn't designed with the safe zone that purpose requires.
    return {
      icon: [{ url: iconUrl, sizes: "512x512", type: "image/png" }],
      apple: { url: iconUrl, sizes: "512x512" },
      manifest: [{ src: iconUrl, sizes: "512x512", type: "image/png" }],
    };
  }
  return {
    icon: [16, 32, 48].map((px) => ({ url: `${KIT}/favicon-${px}.png`, sizes: `${px}x${px}`, type: "image/png" as const })),
    apple: { url: `${KIT}/apple-touch-icon.png`, sizes: "180x180" },
    manifest: [
      { src: `${KIT}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${KIT}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${KIT}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
