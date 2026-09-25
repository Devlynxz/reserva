/**
 * Post-sign-in destination from an untrusted `?next=` value. Only same-origin admin
 * paths are allowed, so the parameter can't be used as an open redirect.
 */
export function safeAdminRedirect(next: string | null | undefined, fallback = "/admin"): string {
  if (!next) return fallback;
  // Reject protocol-relative ("//evil.com"), backslash tricks ("/\evil.com") and control chars.
  if (!next.startsWith("/admin") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  // Resolving against a dummy origin collapses "/admin/../book"-style paths before the final check.
  const url = new URL(next, "https://reserva.invalid");
  if (url.origin !== "https://reserva.invalid" || !/^\/admin(\/|$)/.test(url.pathname)) return fallback;
  return url.pathname + url.search;
}
