import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
