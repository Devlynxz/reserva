import "server-only";
import { type BookingStatus, isHoldExpired } from "@/lib/booking-status";
import type { PriceBreakdown } from "@/lib/pricing";
import { db } from "./db";

// Read models for the public site. Every field here is safe to show to anyone who can
// see the page it's used on — nothing about other customers, no internal notes.

export type PublicResource = {
  id: string;
  name: string;
  type: "SPACE" | "STAFF";
  description: string | null;
  capacity: number | null;
  photos: string[];
};

export type PublicOffering = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  mode: "WINDOW" | "SLOT";
  startMinute: number | null;
  endMinute: number | null;
  endsNextDay: boolean;
  durationMin: number | null;
  basePrice: string;
  weekendPrice: string | null;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: string;
  resources: PublicResource[];
};

export async function listPublicOfferings(): Promise<PublicOffering[]> {
  const rows = await db.offering.findMany({
    where: { isActive: true, resources: { some: { isActive: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      resources: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, type: true, description: true, capacity: true, photos: true },
      },
    },
  });
  return rows.map((o) => ({
    id: o.id,
    slug: o.slug,
    name: o.name,
    description: o.description,
    mode: o.mode,
    startMinute: o.startMinute,
    endMinute: o.endMinute,
    endsNextDay: o.endsNextDay,
    durationMin: o.durationMin,
    basePrice: o.basePrice.toString(),
    weekendPrice: o.weekendPrice?.toString() ?? null,
    includedGuests: o.includedGuests,
    maxGuests: o.maxGuests,
    extraGuestFee: o.extraGuestFee.toString(),
    resources: o.resources,
  }));
}

/** What the customer who made a booking may see about it. No internal notes, no audit trail. */
export type CustomerBookingView = {
  referenceCode: string;
  status: BookingStatus;
  offeringName: string;
  offeringMode: "WINDOW" | "SLOT";
  resourceName: string;
  resourceType: "SPACE" | "STAFF";
  startAt: Date;
  endAt: Date;
  guestCount: number;
  customerName: string;
  customerEmail: string;
  customerNotes: string | null;
  totalAmount: string;
  depositAmount: string;
  amountPaid: string;
  currency: string;
  holdExpiresAt: Date | null;
  /** A pending hold whose time is up (lazy expiry may not have run yet). */
  holdPassed: boolean;
  price: PriceBreakdown;
};

/**
 * The booking behind a reference code, with the hash its access token must match.
 * Callers MUST check access (token or signed cookie) before showing the view.
 */
export async function findCustomerBooking(
  referenceCode: string,
  now = new Date(),
): Promise<{ id: string; accessTokenHash: string; view: CustomerBookingView } | null> {
  const b = await db.booking.findUnique({
    where: { referenceCode },
    select: {
      id: true,
      referenceCode: true,
      accessTokenHash: true,
      status: true,
      startAt: true,
      endAt: true,
      guestCount: true,
      customerName: true,
      customerEmail: true,
      customerNotes: true,
      totalAmount: true,
      depositAmount: true,
      amountPaid: true,
      currency: true,
      holdExpiresAt: true,
      priceBreakdown: true,
      offering: { select: { name: true, mode: true } },
      resource: { select: { name: true, type: true } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    accessTokenHash: b.accessTokenHash,
    view: {
      referenceCode: b.referenceCode,
      status: b.status,
      offeringName: b.offering.name,
      offeringMode: b.offering.mode,
      resourceName: b.resource.name,
      resourceType: b.resource.type,
      startAt: b.startAt,
      endAt: b.endAt,
      guestCount: b.guestCount,
      customerName: b.customerName,
      customerEmail: b.customerEmail,
      customerNotes: b.customerNotes,
      totalAmount: b.totalAmount.toString(),
      depositAmount: b.depositAmount.toString(),
      amountPaid: b.amountPaid.toString(),
      currency: b.currency,
      holdExpiresAt: b.holdExpiresAt,
      holdPassed: isHoldExpired(b, now),
      price: b.priceBreakdown as PriceBreakdown,
    },
  };
}

/** True when the reference exists AND was booked with this email (compared case-insensitively). */
export async function bookingMatchesEmail(referenceCode: string, email: string): Promise<boolean> {
  const match = await db.booking.findFirst({
    where: { referenceCode, customerEmail: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  return match !== null;
}
