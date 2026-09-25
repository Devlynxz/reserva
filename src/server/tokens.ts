import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Access tokens for /book/[ref]?t=… — the reference code is meant to be read aloud, so
// it can't be what protects a customer's details. Only the SHA-256 of the token is
// stored; a database leak doesn't leak working links.

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
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
// After a successful /lookup (reference + email) the customer gets a short-lived,
// HMAC-signed cookie scoped to /book/<ref>. No token rotation (their emailed link keeps
// working) and nothing personal ends up in a URL.

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
