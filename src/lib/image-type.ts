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
