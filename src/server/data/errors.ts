import "server-only";

// Database errors the app turns into user-facing outcomes. Prisma's pg adapter surfaces
// the Postgres error under `meta.driverAdapterError.cause` (and drops the `constraint`
// field), so exclusion violations are identified by SQLSTATE + the constraint name the
// message starts with or quotes — see the booking_integrity migration.

type DriverCause = { code?: string; originalCode?: string; message?: string; constraint?: { index?: string } };

function driverCause(error: unknown): DriverCause | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: DriverCause } } }).meta;
  return meta?.driverAdapterError?.cause;
}

/** Postgres 23P01 (exclusion_violation), optionally for a specific constraint. */
export function isExclusionViolation(error: unknown, constraint?: string): boolean {
  const cause = driverCause(error);
  if ((cause?.originalCode ?? cause?.code) !== "23P01") return false;
  return constraint === undefined || (cause?.message ?? "").includes(constraint);
}

/** Unique-constraint violation (Prisma P2002), optionally on a specific index. */
export function isUniqueViolation(error: unknown, index?: string): boolean {
  if ((error as { code?: string } | null)?.code !== "P2002") return false;
  return index === undefined || driverCause(error)?.constraint?.index === index;
}

export const CONSTRAINTS = {
  /** Two active bookings overlap on a resource (exclusion constraint). */
  bookingOverlap: "bookings_no_overlap",
  /** A booking falls inside a blocked period (trigger). */
  bookingInBlock: "bookings_blocked_period",
  /** A block would cover active bookings (trigger). */
  blockOverBookings: "blocked_periods_overlap_bookings",
} as const;

export type BookingConflictReason = "taken" | "blocked";

/** The requested time can't be booked. Safe to show `message` to customers. */
export class BookingConflictError extends Error {
  override name = "BookingConflictError";
  constructor(readonly reason: BookingConflictReason) {
    super(
      reason === "blocked"
        ? "That time isn't available. Please choose another."
        : "That time was just taken. Please choose another.",
    );
  }
}

export type BookingInputErrorCode =
  | "offering_not_found"
  | "resource_not_offered"
  | "no_resources"
  | "invalid_time"
  | "outside_booking_window"
  | "invalid_guests";

/** The request doesn't describe a bookable option. Safe to show `message` to customers. */
export class BookingInputError extends Error {
  override name = "BookingInputError";
  constructor(
    readonly code: BookingInputErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class BookingNotFoundError extends Error {
  override name = "BookingNotFoundError";
  constructor() {
    super("Booking not found.");
  }
}

/** A blocked period would cover bookings that are still active. */
export class BlockConflictError extends Error {
  override name = "BlockConflictError";
  constructor() {
    super("There are active bookings in that period. Cancel or move them first.");
  }
}

export class SettingsMissingError extends Error {
  override name = "SettingsMissingError";
  constructor() {
    super("Business settings are missing. Run `npm run db:seed` to create them.");
  }
}
