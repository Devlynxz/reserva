// Brand color handling. The brand hex comes from Settings (admin-editable) and is
// interpolated into a <style> tag, so it must be strictly validated first.

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#ABC" / "abc" / "#aabbcc" → "#aabbcc"; anything else → null. */
export function normalizeHex(input: string): string | null {
  const match = HEX.exec(input.trim());
  if (!match?.[1]) return null;
  const digits = match[1].toLowerCase();
  const full = digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits;
  return `#${full}`;
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a normalized "#rrggbb". */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on the brand color. */
export function readableTextOn(hex: string): "#ffffff" | "#0f1720" {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, "#0f1720") ? "#ffffff" : "#0f1720";
}

/** CSS custom properties for the brand; falls back when the stored value is invalid. */
export function brandCssVars(input: string, fallback: string): string {
  const brand = normalizeHex(input) ?? normalizeHex(fallback) ?? "#0e7c86";
  return `--brand:${brand};--brand-contrast:${readableTextOn(brand)};`;
}
