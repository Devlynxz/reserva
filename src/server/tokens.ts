// Customer access to /book/[ref]. No "server-only" import: pure node:crypto with the
// secret passed in, so the seed script can use it too. Never import it from client code.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// ─── Link tokens (/book/[ref]?t=…) ──────────────────────────────────────────
// The reference code is meant to be read aloud, so it can't be what protects a
// customer's details. The token is derived from the booking id with the server secret:
// any email (received, confirmed, reminder) can include a working link, while only the
// token's SHA-256 is stored — a database leak alone doesn't yield working links.

export function deriveAccessToken(secret: string, bookingId: string): string {
  return createHmac("sha256", secret).update(`reserva:booking-link:${bookingId}`).digest("base64url");
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function accessTokenMatches(token: string, storedHash: string): boolean {
  const presented = Buffer.from(hashAccessToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}

// ─── Booking access cookie ──────────────────────────────────────────────────
// After a successful /lookup (reference + email), and when a customer is sent to checkout,
// they get a short-lived HMAC-signed cookie scoped to /book/<ref>. Nothing personal (and
// no link token) ends up in a URL we hand to a payment provider.

export const BOOKING_ACCESS_TTL_SEC = 60 * 60;

export function bookingAccessCookieName(referenceCode: string): string {
  return `rsv_access_${referenceCode.replace(/[^A-Z0-9]/g, "")}`;
}

function accessMac(secret: string, referenceCode: string, expiresAtMs: number): string {
  return createHmac("sha256", secret).update(`reserva:booking-access:${referenceCode}:${expiresAtMs}`).digest("base64url");
}

export function signBookingAccess(secret: string, referenceCode: string, expiresAtMs: number): string {
  return `${expiresAtMs}.${accessMac(secret, referenceCode, expiresAtMs)}`;
}

export function verifyBookingAccess(secret: string, referenceCode: string, value: string | undefined, now = Date.now()): boolean {
  if (!value) return false;
  const [expires, mac] = value.split(".");
  const expiresAtMs = Number(expires);
  if (!mac || !Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now) return false;
  const expected = Buffer.from(accessMac(secret, referenceCode, expiresAtMs));
  const presented = Buffer.from(mac);
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}
