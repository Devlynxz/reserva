import "server-only";
import { withinHorizon } from "@/lib/availability";
import {
  ACTIVE_STATUSES,
  type Actor,
  type BookingSource,
  type BookingStatus,
  assertTransition,
  initialStatus,
} from "@/lib/booking-status";
import { DateError, type LocalDate, addMinutes } from "@/lib/dates";
import type { BookingSpan } from "@/lib/intervals";
import { toAmountString } from "@/lib/money";
import { type PriceBreakdown, PricingError, quote, toPriceBreakdown } from "@/lib/pricing";
import { generateReferenceCode } from "@/lib/reference-code";
import { SlotError, isOnGrid, slotSpan } from "@/lib/slots";
import { modeFieldError } from "@/lib/validation";
import { WindowError, windowSpan } from "@/lib/windows";
import type { Prisma } from "@/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { env } from "../env";
import { deriveAccessToken, hashAccessToken } from "../tokens";
import { type BookableOffering, findBookableOffering, loadHours, loadOverrides } from "./catalog";
import { db } from "./db";
import {
  BookingConflictError,
  BookingInputError,
  BookingNotFoundError,
  CONSTRAINTS,
  isExclusionViolation,
  isUniqueViolation,
} from "./errors";
import { type BusinessSettings, getSettings } from "./settings";

type Tx = Prisma.TransactionClient;

// 20 people racing for one slot queue on the same advisory lock; give them room.
const TX_OPTIONS = { maxWait: 15_000, timeout: 30_000 } as const;
const MAX_REFERENCE_ATTEMPTS = 3;

// ─── Locks & hold expiry ────────────────────────────────────────────────────

/** Per-resource transaction lock, shared with the booking/block triggers. Always ascending id order. */
async function lockResources(tx: Tx, resourceIds: readonly string[]): Promise<void> {
  for (const id of [...resourceIds].sort()) {
    await tx.$executeRaw`SELECT reserva_lock_resource(${id}::uuid)`;
  }
}

/**
 * PENDING_PAYMENT → EXPIRED for holds past their expiry (all resources, or just some).
 * Runs inside createBooking before it looks for a free resource, and on a schedule as a
 * backstop. `updateManyAndReturn` only returns rows this call actually changed, so a
 * concurrent sweep can't write duplicate events.
 */
export async function expireStaleHolds(tx: Tx, options: { now: Date; resourceIds?: readonly string[] }): Promise<number> {
  assertTransition("PENDING_PAYMENT", "EXPIRED", "system", { now: options.now, startAt: options.now });
  const expired = await tx.booking.updateManyAndReturn({
    where: {
      status: "PENDING_PAYMENT",
      holdExpiresAt: { lte: options.now },
      ...(options.resourceIds ? { resourceId: { in: [...options.resourceIds] } } : {}),
    },
    data: { status: "EXPIRED" },
    select: { id: true },
  });
  if (expired.length > 0) {
    await tx.bookingEvent.createMany({
      data: expired.map(({ id }) => ({
        bookingId: id,
        fromStatus: "PENDING_PAYMENT" as const,
        toStatus: "EXPIRED" as const,
        note: "Payment hold expired",
      })),
    });
  }
  return expired.length;
}

/** Scheduled backstop (Inngest): expire every stale hold. */
export async function sweepExpiredHolds(now = new Date()): Promise<number> {
  return db.$transaction((tx) => expireStaleHolds(tx, { now }));
}

// ─── Transitions ────────────────────────────────────────────────────────────

export type TransitionInput = {
  bookingId: string;
  to: BookingStatus;
  actor: Actor;
  actorId?: string | null;
  note?: string;
  now?: Date;
};

/**
 * The one way to change a booking's status (besides bulk hold expiry above): locks the
 * row, checks the state machine, writes the status and its BookingEvent. Use inside a
 * larger transaction (e.g. with a Payment insert) or via `transitionBooking`.
 */
export async function transitionInTx(tx: Tx, input: TransitionInput): Promise<{ from: BookingStatus; to: BookingStatus }> {
  const now = input.now ?? new Date();
  const [locked] = await tx.$queryRaw<Array<{ status: BookingStatus; start_at: Date }>>`
    SELECT status, start_at FROM bookings WHERE id = ${input.bookingId}::uuid FOR UPDATE`;
  if (!locked) throw new BookingNotFoundError();

  assertTransition(locked.status, input.to, input.actor, { now, startAt: locked.start_at });
  try {
    await tx.booking.update({
      where: { id: input.bookingId },
      // A confirmed booking no longer holds anything pending.
      data: { status: input.to, ...(input.to === "CONFIRMED" ? { holdExpiresAt: null } : {}) },
    });
  } catch (error) {
    // Only reachable when reactivating (EXPIRED → CONFIRMED) a slot someone else took.
    if (isExclusionViolation(error)) {
      throw new BookingConflictError(isExclusionViolation(error, CONSTRAINTS.bookingInBlock) ? "blocked" : "taken");
    }
    throw error;
  }
  await tx.bookingEvent.create({
    data: {
      bookingId: input.bookingId,
      fromStatus: locked.status,
      toStatus: input.to,
      actorId: input.actorId ?? null,
      note: input.note ?? null,
    },
  });
  return { from: locked.status, to: input.to };
}

export async function transitionBooking(input: TransitionInput) {
  return db.$transaction((tx) => transitionInTx(tx, input), TX_OPTIONS);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export type CreateBookingInput = {
  offering: { slug: string } | { id: string };
  /** A specific resource, or "any" = first free resource in preference order. */
  resourceId: string;
  date: LocalDate;
  /** SLOT offerings only: local start time in minutes after midnight. */
  startMinute?: number;
  guestCount: number;
  customer: { name: string; email: string; phone?: string };
  customerNotes?: string;
  internalNotes?: string;
  source: BookingSource;
  /** Staff bookings: keep pending (no hold) until payment is recorded. */
  awaitingPayment?: boolean;
  actorId?: string | null;
};

/** The bookable choice without who's booking — what the review step prices. */
export type BookingSelection = Pick<CreateBookingInput, "offering" | "resourceId" | "date" | "startMinute" | "guestCount" | "source">;

export type CreatedBooking = {
  id: string;
  referenceCode: string;
  /** For the confirmation link. Re-derivable later from the id (see bookingLink). */
  accessToken: string;
  status: BookingStatus;
  resourceId: string;
  startAt: Date;
  endAt: Date;
  holdExpiresAt: Date | null;
  totalAmount: string;
  depositAmount: string;
  currency: string;
};

/** Mode-specific step: which resources can take the request, and the time it occupies. */
async function resolveSpan(
  offering: BookableOffering,
  input: BookingSelection,
  candidates: string[],
  settings: BusinessSettings,
): Promise<{ span: BookingSpan; candidates: string[] }> {
  try {
    if (offering.mode === "WINDOW") {
      const span = windowSpan(
        {
          startMinute: offering.startMinute!,
          endMinute: offering.endMinute!,
          endsNextDay: offering.endsNextDay,
          bufferMin: offering.bufferMin,
        },
        input.date,
        settings.timezone,
      );
      return { span, candidates };
    }

    const slotOffering = { durationMin: offering.durationMin!, slotStepMin: offering.slotStepMin!, bufferMin: offering.bufferMin };
    const startMinute = input.startMinute!;
    const hours = await loadHours(candidates);
    const onGrid = candidates.filter((resourceId) =>
      isOnGrid({ offering: slotOffering, resourceId, date: input.date, startMinute, hours, timeZone: settings.timezone }),
    );
    if (onGrid.length === 0) throw new BookingInputError("invalid_time", "That time isn't offered. Please pick one of the listed times.");
    return { span: slotSpan(slotOffering, input.date, startMinute, settings.timezone), candidates: onGrid };
  } catch (error) {
    if (error instanceof DateError || error instanceof WindowError || error instanceof SlotError) {
      throw new BookingInputError("invalid_time", "That date or time isn't valid.");
    }
    throw error;
  }
}

type PreparedBooking = {
  settings: BusinessSettings;
  offering: BookableOffering;
  span: BookingSpan;
  /** Resources that can take the request (grid-checked), in preference order. */
  candidates: string[];
  priceFor: (resourceId: string) => ReturnType<typeof quote>;
};

/**
 * Everything short of writing: resolve the offering, candidate resources, the time span
 * (mode-specific) and pricing, and reject requests that can't be booked. Shared by
 * `createBooking` and `previewBooking`, so the review step shows exactly what create will charge.
 */
async function prepareBooking(input: BookingSelection, now: Date): Promise<PreparedBooking> {
  const settings = await getSettings();
  const offering = await findBookableOffering(input.offering);
  if (!offering) throw new BookingInputError("offering_not_found", "That package isn't available.");

  const modeError = modeFieldError(offering.mode, { startTime: input.startMinute });
  if (modeError) throw new BookingInputError("invalid_time", modeError);

  let candidates = offering.resourceIds;
  if (input.resourceId !== "any") {
    if (!candidates.includes(input.resourceId)) {
      throw new BookingInputError("resource_not_offered", "That option isn't available for this package.");
    }
    candidates = [input.resourceId];
  }
  if (candidates.length === 0) throw new BookingInputError("no_resources", "This package has nothing to book right now.");

  const resolved = await resolveSpan(offering, input, candidates, settings);
  const { span } = resolved;
  candidates = resolved.candidates;

  // Staff may enter walk-ins for right now or record past bookings; customers may not.
  if (
    input.source === "ONLINE" &&
    !withinHorizon(span.startAt, {
      now,
      timeZone: settings.timezone,
      leadTimeMin: settings.leadTimeMin,
      maxAdvanceDays: settings.maxAdvanceDays,
    })
  ) {
    throw new BookingInputError("outside_booking_window", "That date can't be booked online. Please choose another.");
  }

  const overrides = await loadOverrides(offering.id, input.date);
  const priceFor = (resourceId: string) => {
    try {
      return quote({
        offering,
        resourceId,
        date: input.date,
        guestCount: input.guestCount,
        overrides,
        weekendDays: settings.weekendDays,
        depositPercent: settings.depositPercent,
        currency: settings.currency,
      });
    } catch (error) {
      if (error instanceof PricingError && (error.code === "too_few_guests" || error.code === "too_many_guests")) {
        throw new BookingInputError("invalid_guests", error.message);
      }
      throw error;
    }
  };
  // Fail fast on guest-count problems before taking any locks.
  priceFor(candidates[0]!);
  return { settings, offering, span, candidates, priceFor };
}

export type BookingPreview = {
  startAt: Date;
  endAt: Date;
  price: PriceBreakdown;
};

/**
 * The review step's price. Doesn't reserve anything: for "any", it prices the first
 * candidate — only a resource-specific override could make the final price differ.
 */
export async function previewBooking(input: BookingSelection, options: { now?: Date } = {}): Promise<BookingPreview> {
  const { span, candidates, priceFor } = await prepareBooking(input, options.now ?? new Date());
  return { startAt: span.startAt, endAt: span.endAt, price: toPriceBreakdown(priceFor(candidates[0]!)) };
}

/**
 * The single booking path for both modes and every source (online, walk-in, message).
 *
 *  1. validate the request against the offering (mode fields, resource, grid, horizon)
 *  2. in one transaction: lock candidate resources (ascending id) → expire their stale
 *     holds → pick the first free one → price it → insert the booking + its first event
 *  3. map 23P01 from the exclusion constraint / block trigger to BookingConflictError
 *
 * Under the lock the free-resource check is exact, so losers of a race get a clean
 * "just taken" before touching the constraint; the constraint remains the guarantee.
 */
export async function createBooking(input: CreateBookingInput, options: { now?: Date } = {}): Promise<CreatedBooking> {
  const now = options.now ?? new Date();
  const { settings, offering, span, candidates, priceFor } = await prepareBooking(input, now);

  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await lockResources(tx, candidates);
        await expireStaleHolds(tx, { now, resourceIds: candidates });

        const [busy, blocks] = await Promise.all([
          tx.booking.findMany({
            where: {
              resourceId: { in: candidates },
              status: { in: [...ACTIVE_STATUSES] },
              startAt: { lt: span.occupiedUntil },
              occupiedUntil: { gt: span.startAt },
            },
            select: { resourceId: true },
          }),
          tx.blockedPeriod.findMany({
            where: {
              OR: [{ resourceId: { in: candidates } }, { resourceId: null }],
              startAt: { lt: span.occupiedUntil },
              endAt: { gt: span.startAt },
            },
            select: { resourceId: true },
          }),
        ]);
        const taken = new Set(busy.map((b) => b.resourceId));
        const blocked = new Set(blocks.map((b) => b.resourceId));
        const resourceId = candidates.find((id) => !taken.has(id) && !blocked.has(id) && !blocked.has(null));
        if (!resourceId) {
          const allBlocked = blocked.has(null) || candidates.every((id) => blocked.has(id));
          throw new BookingConflictError(allBlocked ? "blocked" : "taken");
        }

        const price = priceFor(resourceId);
        const { status, hasHold } = initialStatus(input.source, { awaitingPayment: input.awaitingPayment });
        const id = randomUUID();
        const accessToken = deriveAccessToken(env().BETTER_AUTH_SECRET, id);

        const booking = await tx.booking.create({
          data: {
            id,
            referenceCode: generateReferenceCode(),
            accessTokenHash: hashAccessToken(accessToken),
            resourceId,
            offeringId: offering.id,
            startAt: span.startAt,
            endAt: span.endAt,
            occupiedUntil: span.occupiedUntil,
            customerName: input.customer.name,
            customerEmail: input.customer.email,
            customerPhone: input.customer.phone ?? null,
            guestCount: input.guestCount,
            customerNotes: input.customerNotes ?? null,
            internalNotes: input.internalNotes ?? null,
            totalAmount: toAmountString(price.total, settings.currency),
            depositAmount: toAmountString(price.deposit, settings.currency),
            currency: settings.currency,
            priceBreakdown: toPriceBreakdown(price),
            status,
            source: input.source,
            holdExpiresAt: hasHold ? addMinutes(now, settings.holdMinutes) : null,
          },
          select: { id: true, referenceCode: true, status: true, holdExpiresAt: true },
        });
        await tx.bookingEvent.create({
          data: {
            bookingId: booking.id,
            fromStatus: null,
            toStatus: status,
            actorId: input.actorId ?? null,
            note: `Created (${input.source.toLowerCase().replace("_", "-")})`,
          },
        });

        return {
          id: booking.id,
          referenceCode: booking.referenceCode,
          accessToken,
          status: booking.status,
          resourceId,
          startAt: span.startAt,
          endAt: span.endAt,
          holdExpiresAt: booking.holdExpiresAt,
          totalAmount: toAmountString(price.total, settings.currency),
          depositAmount: toAmountString(price.deposit, settings.currency),
          currency: settings.currency,
        };
      }, TX_OPTIONS);
    } catch (error) {
      // ~28.6M codes: a clash is rare, and the unique index catches it. Just draw again.
      if (isUniqueViolation(error, "bookings_reference_code_key") && attempt < MAX_REFERENCE_ATTEMPTS) continue;
      if (isExclusionViolation(error)) {
        throw new BookingConflictError(isExclusionViolation(error, CONSTRAINTS.bookingInBlock) ? "blocked" : "taken");
      }
      throw error;
    }
  }
}

// ─── Reactivation check (late payments) ────────────────────────────────────

/**
 * Could this (EXPIRED) booking take its time back? Locks the resource first, so the answer
 * holds until the transaction ends; stale holds on the resource are expired so an
 * abandoned checkout doesn't count against a customer who actually paid.
 */
export async function slotStillFree(
  tx: Tx,
  booking: { id: string; resourceId: string; startAt: Date; occupiedUntil: Date },
  now: Date,
): Promise<boolean> {
  await lockResources(tx, [booking.resourceId]);
  await expireStaleHolds(tx, { now, resourceIds: [booking.resourceId] });
  const [clashes, blocks] = await Promise.all([
    tx.booking.count({
      where: {
        id: { not: booking.id },
        resourceId: booking.resourceId,
        status: { in: [...ACTIVE_STATUSES] },
        startAt: { lt: booking.occupiedUntil },
        occupiedUntil: { gt: booking.startAt },
      },
    }),
    tx.blockedPeriod.count({
      where: {
        OR: [{ resourceId: booking.resourceId }, { resourceId: null }],
        startAt: { lt: booking.occupiedUntil },
        endAt: { gt: booking.startAt },
      },
    }),
  ]);
  return clashes + blocks === 0;
}
