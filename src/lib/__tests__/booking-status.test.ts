import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  type Actor,
  BOOKING_STATUSES,
  type BookingStatus,
  TransitionError,
  assertTransition,
  canTransition,
  initialStatus,
  isActive,
  isFinal,
  isHoldExpired,
  nextStatuses,
} from "../booking-status";

const ACTORS: Actor[] = ["customer", "staff", "system", "webhook"];
const started = { now: new Date("2026-04-05T12:00:00Z"), startAt: new Date("2026-04-05T10:00:00Z") };
const future = { now: new Date("2026-04-05T08:00:00Z"), startAt: new Date("2026-04-05T10:00:00Z") };

// The whole table, written out. Anything not listed must be refused for every actor.
const ALLOWED: Array<[BookingStatus, BookingStatus, Actor[]]> = [
  ["PENDING_PAYMENT", "CONFIRMED", ["webhook", "staff"]],
  ["PENDING_PAYMENT", "EXPIRED", ["system"]],
  ["PENDING_PAYMENT", "CANCELLED", ["staff", "system"]],
  ["EXPIRED", "CONFIRMED", ["webhook"]],
  ["CONFIRMED", "COMPLETED", ["staff"]],
  ["CONFIRMED", "NO_SHOW", ["staff"]],
  ["CONFIRMED", "CANCELLED", ["staff"]],
];

describe("transition matrix", () => {
  for (const from of BOOKING_STATUSES) {
    for (const to of BOOKING_STATUSES) {
      const rule = ALLOWED.find(([f, t]) => f === from && t === to);
      for (const actor of ACTORS) {
        const expected = rule?.[2].includes(actor) ?? false;
        it(`${from} → ${to} by ${actor}: ${expected ? "allowed" : "refused"}`, () => {
          expect(canTransition(from, to, actor, started)).toBe(expected);
        });
      }
    }
  }
});

describe("assertTransition errors", () => {
  it("explains a transition that doesn't exist", () => {
    try {
      assertTransition("CANCELLED", "CONFIRMED", "staff", started);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(TransitionError);
      expect(error).toMatchObject({ code: "not_allowed", from: "CANCELLED", to: "CONFIRMED" });
    }
  });

  it("explains a transition by the wrong actor", () => {
    expect(() => assertTransition("EXPIRED", "CONFIRMED", "staff", started)).toThrow(
      expect.objectContaining({ code: "wrong_actor" }),
    );
    // Customers can't change status at all — only pay (via the webhook).
    expect(() => assertTransition("PENDING_PAYMENT", "CANCELLED", "customer", started)).toThrow(
      expect.objectContaining({ code: "wrong_actor" }),
    );
  });

  it("won't complete or no-show a booking before it starts", () => {
    for (const to of ["COMPLETED", "NO_SHOW"] as const) {
      expect(() => assertTransition("CONFIRMED", to, "staff", future)).toThrow(expect.objectContaining({ code: "not_started" }));
      expect(canTransition("CONFIRMED", to, "staff", { now: future.startAt, startAt: future.startAt })).toBe(true);
    }
    // Cancelling ahead of time is fine.
    expect(canTransition("CONFIRMED", "CANCELLED", "staff", future)).toBe(true);
  });

  it("canTransition rethrows unexpected errors", () => {
    expect(() => canTransition("NOPE" as BookingStatus, "CONFIRMED", "staff", started)).toThrow(TypeError);
  });
});

describe("nextStatuses", () => {
  it("lists what staff can do next", () => {
    expect(nextStatuses("PENDING_PAYMENT", "staff", started)).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(nextStatuses("CONFIRMED", "staff", future)).toEqual(["CANCELLED"]);
    expect(nextStatuses("CONFIRMED", "staff", started)).toEqual(["CANCELLED", "COMPLETED", "NO_SHOW"]);
    expect(nextStatuses("COMPLETED", "staff", started)).toEqual([]);
  });
});

describe("initialStatus", () => {
  it("holds online bookings pending payment", () => {
    expect(initialStatus("ONLINE")).toEqual({ status: "PENDING_PAYMENT", hasHold: true });
    expect(initialStatus("ONLINE", { awaitingPayment: false })).toEqual({ status: "PENDING_PAYMENT", hasHold: true });
  });

  it("confirms staff-entered bookings, or keeps them pending without a hold", () => {
    expect(initialStatus("WALK_IN")).toEqual({ status: "CONFIRMED", hasHold: false });
    expect(initialStatus("MESSAGE", { awaitingPayment: true })).toEqual({ status: "PENDING_PAYMENT", hasHold: false });
  });
});

describe("status helpers", () => {
  it("active statuses match the exclusion constraint", () => {
    expect(ACTIVE_STATUSES).toEqual(["PENDING_PAYMENT", "CONFIRMED"]);
    expect(BOOKING_STATUSES.filter(isActive)).toEqual(["PENDING_PAYMENT", "CONFIRMED"]);
  });

  it("final statuses have no way out; EXPIRED isn't final", () => {
    expect(BOOKING_STATUSES.filter(isFinal)).toEqual(["CANCELLED", "COMPLETED", "NO_SHOW"]);
  });

  it("detects expired holds", () => {
    const now = new Date("2026-04-05T10:00:00Z");
    expect(isHoldExpired({ status: "PENDING_PAYMENT", holdExpiresAt: new Date("2026-04-05T09:59:59Z") }, now)).toBe(true);
    expect(isHoldExpired({ status: "PENDING_PAYMENT", holdExpiresAt: now }, now)).toBe(true);
    expect(isHoldExpired({ status: "PENDING_PAYMENT", holdExpiresAt: new Date("2026-04-05T10:00:01Z") }, now)).toBe(false);
    expect(isHoldExpired({ status: "PENDING_PAYMENT", holdExpiresAt: null }, now)).toBe(false);
    expect(isHoldExpired({ status: "CONFIRMED", holdExpiresAt: new Date("2026-04-05T09:00:00Z") }, now)).toBe(false);
  });
});
