// Identify an uploaded image by its first bytes, not its name or the browser's claimed
// type (both are attacker-controlled). Only raster formats are accepted: SVG can carry
// script, so it's never allowed as a logo.

export type ImageType = { ext: "png" | "jpg" | "webp"; mime: "image/png" | "image/jpeg" | "image/webp" };

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", mime: "image/png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", mime: "image/jpeg" };
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", mime: "image/webp" };
  return null;
}

/** Pixel size of a PNG, read from its IHDR chunk (always the first chunk). */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (detectImageType(bytes)?.ext !== "png" || bytes.length < 24) return null;
  // Layout after the 8-byte signature: length(4) "IHDR"(4) width(4) height(4), big-endian.
  if (!startsWith(bytes, [0x49, 0x48, 0x44, 0x52], 12)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Favicons, home-screen icons and the share image all derive from one square PNG. */
export const APP_ICON_SIZE = 512;

/** null when the bytes are a usable app icon; otherwise what to tell the owner. */
export function checkAppIcon(bytes: Uint8Array): string | null {
  const size = pngSize(bytes);
  if (!size) return "Use a PNG image for the app icon.";
  if (size.width !== APP_ICON_SIZE || size.height !== APP_ICON_SIZE) {
    return `Use a square PNG of exactly ${APP_ICON_SIZE} × ${APP_ICON_SIZE} pixels (this one is ${size.width} × ${size.height}).`;
  }
  return null;
}
