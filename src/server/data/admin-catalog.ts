import "server-only";
import type { LocalDate } from "@/lib/dates";
import type { HoursRow } from "@/lib/slots";
import { db } from "./db";

// Catalog management for the admin: resources, offerings, business hours, price
// overrides, blocked periods. Deactivate rather than delete anything bookings point at.

export class CatalogError extends Error {
  override name = "CatalogError";
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

// ─── Resources ──────────────────────────────────────────────────────────────

export type ResourceInput = {
  slug: string;
  name: string;
  type: "SPACE" | "STAFF";
  description?: string;
  capacity?: number;
  isActive: boolean;
  sortOrder: number;
};

export function listResources() {
  return db.resource.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { bookings: true, offerings: true } } },
  });
}

export function getResource(id: string) {
  return db.resource.findUnique({ where: { id } });
}

export async function saveResource(input: ResourceInput, id?: string) {
  const data = { ...input, description: input.description ?? null, capacity: input.capacity ?? null };
  return id ? db.resource.update({ where: { id }, data }) : db.resource.create({ data });
}

// ─── Offerings ──────────────────────────────────────────────────────────────

export type OfferingInput = {
  slug: string;
  name: string;
  description?: string;
  mode: "WINDOW" | "SLOT";
  startMinute?: number;
  endMinute?: number;
  endsNextDay?: boolean;
  durationMin?: number;
  slotStepMin?: number;
  bufferMin: number;
  basePrice: string;
  weekendPrice?: string;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: string;
  isActive: boolean;
  sortOrder: number;
  resourceIds: string[];
};

export function listOfferings() {
  return db.offering.findMany({
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { resources: { select: { id: true, name: true } }, _count: { select: { bookings: true } } },
  });
}

export function getOffering(id: string) {
  return db.offering.findUnique({ where: { id }, include: { resources: { select: { id: true } } } });
}

export async function saveOffering(input: OfferingInput, id?: string) {
  const { resourceIds, ...fields } = input;
  const timing =
    fields.mode === "WINDOW"
      ? { startMinute: fields.startMinute!, endMinute: fields.endMinute!, endsNextDay: fields.endsNextDay!, durationMin: null, slotStepMin: null }
      : { startMinute: null, endMinute: null, endsNextDay: false, durationMin: fields.durationMin!, slotStepMin: fields.slotStepMin! };
  const data = {
    slug: fields.slug,
    name: fields.name,
    description: fields.description ?? null,
    mode: fields.mode,
    ...timing,
    bufferMin: fields.bufferMin,
    basePrice: fields.basePrice,
    weekendPrice: fields.weekendPrice ?? null,
    includedGuests: fields.includedGuests,
    maxGuests: fields.maxGuests,
    extraGuestFee: fields.extraGuestFee,
    isActive: fields.isActive,
    sortOrder: fields.sortOrder,
  };
  const resources = resourceIds.map((rid) => ({ id: rid }));
  return id
    ? db.offering.update({ where: { id }, data: { ...data, resources: { set: resources } } })
    : db.offering.create({ data: { ...data, resources: { connect: resources } } });
}

// ─── Business hours ─────────────────────────────────────────────────────────

export function listHours() {
  return db.businessHours.findMany({ orderBy: [{ resourceId: "asc" }, { weekday: "asc" }, { openMinute: "asc" }] });
}

/** Adds an opening interval; refuses one that overlaps another in the same schedule and day. */
export async function addHours(row: HoursRow) {
  const clash = await db.businessHours.findFirst({
    where: {
      resourceId: row.resourceId,
      weekday: row.weekday,
      openMinute: { lt: row.closeMinute },
      closeMinute: { gt: row.openMinute },
    },
  });
  if (clash) throw new CatalogError("That overlaps hours already set for this day.", "openTime");
  return db.businessHours.create({ data: row });
}

export async function deleteHours(id: string) {
  await db.businessHours.delete({ where: { id } });
}

// ─── Price overrides ────────────────────────────────────────────────────────

export function listOverrides() {
  return db.pricingOverride.findMany({
    orderBy: [{ startDate: "desc" }],
    include: { resource: { select: { name: true } }, offering: { select: { name: true } } },
  });
}

export async function createOverride(input: {
  label: string;
  resourceId: string | null;
  offeringId: string | null;
  startDate: LocalDate;
  endDate: LocalDate;
  fixedPrice?: string;
  multiplier?: string;
}) {
  return db.pricingOverride.create({
    data: {
      label: input.label,
      resourceId: input.resourceId,
      offeringId: input.offeringId,
      startDate: new Date(`${input.startDate}T00:00:00Z`),
      endDate: new Date(`${input.endDate}T00:00:00Z`),
      fixedPrice: input.fixedPrice ?? null,
      multiplier: input.multiplier ?? null,
    },
  });
}

export async function deleteOverride(id: string) {
  await db.pricingOverride.delete({ where: { id } });
}

// ─── Blocked periods (create lives in blocked-periods.ts: it needs the booking guards) ──

export function listUpcomingBlocks(from: Date) {
  return db.blockedPeriod.findMany({
    where: { endAt: { gt: from } },
    orderBy: { startAt: "asc" },
    include: { resource: { select: { name: true } } },
  });
}
