import { describe, expect, it } from "vitest";
import { clientIpFrom } from "../request";
import {
  accessTokenMatches,
  bookingAccessCookieName,
  deriveAccessToken,
  hashAccessToken,
  signBookingAccess,
  verifyBookingAccess,
} from "../tokens";

const SECRET = "test-secret-with-enough-entropy-000000000";

describe("access tokens", () => {
  it("are 256-bit, URL-safe, stable per booking and secret-dependent", () => {
    const a = deriveAccessToken(SECRET, "booking-a");
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(deriveAccessToken(SECRET, "booking-a")).toBe(a);
    expect(deriveAccessToken(SECRET, "booking-b")).not.toBe(a);
    expect(deriveAccessToken(`${SECRET}x`, "booking-a")).not.toBe(a);
  });

  it("match only their own hash", () => {
    const token = deriveAccessToken(SECRET, "booking-a");
    const hash = hashAccessToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(accessTokenMatches(token, hash)).toBe(true);
    expect(accessTokenMatches(deriveAccessToken(SECRET, "booking-b"), hash)).toBe(false);
    expect(accessTokenMatches(token, "not-a-hash")).toBe(false);
  });
});

describe("booking access cookie", () => {
  const now = Date.UTC(2030, 3, 1);
  const future = now + 60_000;

  it("verifies a fresh signature for the same reference", () => {
    const value = signBookingAccess(SECRET, "RSV-7K3Q9", future);
    expect(verifyBookingAccess(SECRET, "RSV-7K3Q9", value, now)).toBe(true);
  });

  it("rejects expiry, tampering, another reference or another secret", () => {
    const value = signBookingAccess(SECRET, "RSV-7K3Q9", future);
    expect(verifyBookingAccess(SECRET, "RSV-7K3Q9", value, future)).toBe(false);
    expect(verifyBookingAccess(SECRET, "RSV-7K3Q9", value.replace(/^\d+/, String(future + 999_999)), now)).toBe(false);
    expect(verifyBookingAccess(SECRET, "RSV-AAAAA", value, now)).toBe(false);
    expect(verifyBookingAccess(`${SECRET}x`, "RSV-7K3Q9", value, now)).toBe(false);
    for (const bad of [undefined, "", "garbage", "123.", ".abc", `${future}.short`]) {
      expect(verifyBookingAccess(SECRET, "RSV-7K3Q9", bad, now)).toBe(false);
    }
  });

  it("names cookies per reference with safe characters only", () => {
    expect(bookingAccessCookieName("RSV-7K3Q9")).toBe("rsv_access_RSV7K3Q9");
  });
});

describe("clientIpFrom", () => {
  it("reads the configured header, first hop only", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.7" }), "x-real-ip")).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), "x-forwarded-for")).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-real-ip": "2001:db8::1" }), "x-real-ip")).toBe("2001:db8::1");
  });

  it("ignores other headers and junk values", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "1.2.3.4" }), "x-real-ip")).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-real-ip": "<script>" }), "x-real-ip")).toBe("unknown");
    expect(clientIpFrom(new Headers(), "x-real-ip")).toBe("unknown");
  });
});
