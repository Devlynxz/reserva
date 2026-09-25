// The booking state machine — the single definition of which status changes exist and
// who may make them. Data code calls `assertTransition` before every status write and
// records a BookingEvent for it; nothing else sets a status.
//
//   (new) ─ONLINE────────────▶ PENDING_PAYMENT ─webhook/staff─▶ CONFIRMED ─staff─▶ COMPLETED
//   (new) ─WALK_IN/MESSAGE──▶ CONFIRMED                           │   │         ─staff─▶ NO_SHOW
//                              PENDING_PAYMENT ─system─▶ EXPIRED ─webhook─▶ CONFIRMED (late payment)
//                              PENDING_PAYMENT ─staff/system─▶ CANCELLED ◀─staff─ CONFIRMED

export const BOOKING_STATUSES = ["PENDING_PAYMENT", "CONFIRMED", "EXPIRED", "CANCELLED", "COMPLETED", "NO_SHOW"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = ["ONLINE", "WALK_IN", "MESSAGE"] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

/**
 * Who causes a change: `customer` (public site), `staff` (ADMIN or STAFF in the admin),
 * `system` (hold expiry, failed checkout creation), `webhook` (verified payment provider event).
 */
export type Actor = "customer" | "staff" | "system" | "webhook";

type TransitionRule = { actors: readonly Actor[]; requiresStarted?: boolean };

const TRANSITIONS: Readonly<Record<BookingStatus, Partial<Record<BookingStatus, TransitionRule>>>> = {
  PENDING_PAYMENT: {
    CONFIRMED: { actors: ["webhook", "staff"] }, // online payment, or cash recorded by staff
    EXPIRED: { actors: ["system"] },
    CANCELLED: { actors: ["staff", "system"] },
  },
  EXPIRED: {
    // Paid after the hold lapsed. Only a verified payment can revive a booking, and the
    // database still refuses it if someone else took the slot meanwhile.
    CONFIRMED: { actors: ["webhook"] },
  },
  CONFIRMED: {
    COMPLETED: { actors: ["staff"], requiresStarted: true },
    NO_SHOW: { actors: ["staff"], requiresStarted: true },
    CANCELLED: { actors: ["staff"] },
  },
  CANCELLED: {},
  COMPLETED: {},
  NO_SHOW: {},
};

export type TransitionErrorCode = "not_allowed" | "wrong_actor" | "not_started";

export class TransitionError extends Error {
  override name = "TransitionError";
  constructor(
    readonly code: TransitionErrorCode,
    readonly from: BookingStatus,
    readonly to: BookingStatus,
    message: string,
  ) {
    super(message);
  }
}

export type TransitionContext = { now: Date; startAt: Date };

/** Throws a TransitionError explaining why, or returns normally when the change is allowed. */
export function assertTransition(from: BookingStatus, to: BookingStatus, actor: Actor, context: TransitionContext): void {
  const rule = TRANSITIONS[from][to];
  if (!rule) throw new TransitionError("not_allowed", from, to, `A ${from} booking can't become ${to}`);
  if (!rule.actors.includes(actor)) {
    throw new TransitionError("wrong_actor", from, to, `${from} → ${to} can't be done by ${actor}`);
  }
  if (rule.requiresStarted && context.now.getTime() < context.startAt.getTime()) {
    throw new TransitionError("not_started", from, to, `A booking can only be marked ${to} once it has started`);
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor, context: TransitionContext): boolean {
  try {
    assertTransition(from, to, actor, context);
    return true;
  } catch (error) {
    if (error instanceof TransitionError) return false;
    throw error;
  }
}

/** Statuses `actor` can move a booking to right now — drives the admin action buttons. */
export function nextStatuses(from: BookingStatus, actor: Actor, context: TransitionContext): BookingStatus[] {
  return BOOKING_STATUSES.filter((to) => canTransition(from, to, actor, context));
}

/**
 * First status for a new booking. Online bookings always hold the slot pending payment.
 * Staff-entered walk-in / message bookings are confirmed, unless staff marks them
 * "awaiting payment" — then they're pending with NO hold, so they don't silently expire.
 */
export function initialStatus(
  source: BookingSource,
  options: { awaitingPayment?: boolean } = {},
): { status: BookingStatus; hasHold: boolean } {
  if (source === "ONLINE") return { status: "PENDING_PAYMENT", hasHold: true };
  return options.awaitingPayment ? { status: "PENDING_PAYMENT", hasHold: false } : { status: "CONFIRMED", hasHold: false };
}

/** Statuses that occupy the resource — must match the exclusion constraint's WHERE clause. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = ["PENDING_PAYMENT", "CONFIRMED"];

export function isActive(status: BookingStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** No way out: cancelled, completed or no-show. (EXPIRED can still be revived by a late payment.) */
export function isFinal(status: BookingStatus): boolean {
  return Object.keys(TRANSITIONS[status]).length === 0;
}

/** Is a pending hold past its expiry at `now`? Pending bookings without a hold never expire. */
export function isHoldExpired(booking: { status: BookingStatus; holdExpiresAt: Date | null }, now: Date): boolean {
  return (
    booking.status === "PENDING_PAYMENT" && booking.holdExpiresAt !== null && booking.holdExpiresAt.getTime() <= now.getTime()
  );
}
