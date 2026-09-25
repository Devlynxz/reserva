/** Join class names, skipping falsy parts. Components put caller classes last. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
