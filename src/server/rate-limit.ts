import "server-only";
import { type RateLimitResult, consumeRateLimit } from "./data/rate-limit";

// Limits for public endpoints. Keys combine the limit name with an IP or a reference, so
// one noisy client can't lock out others, and a single booking can't be brute-forced
// from many IPs.
export const RATE_LIMITS = {
  /** New online bookings per IP. */
  bookingCreate: { limit: 10, windowSec: 10 * 60 },
  /** Price previews per IP (cheap, but still hits the DB). */
  bookingPreview: { limit: 60, windowSec: 10 * 60 },
  /** Reference + email lookups per IP, and per reference code. */
  lookup: { limit: 5, windowSec: 10 * 60 },
  lookupPerReference: { limit: 10, windowSec: 60 * 60 },
  /** Availability reads per IP. */
  availability: { limit: 120, windowSec: 60 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

export function rateLimit(name: RateLimitName, key: string): Promise<RateLimitResult> {
  return consumeRateLimit(`${name}:${key}`, RATE_LIMITS[name]);
}

export function tooManyRequestsMessage(retryAfterSec: number): string {
  const minutes = Math.ceil(retryAfterSec / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
