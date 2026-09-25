import "server-only";
import type { LocalDate } from "@/lib/dates";
import type { PricingOverride } from "@/lib/pricing";
import type { HoursRow } from "@/lib/slots";
import { db } from "./db";

// Read models for the catalog: offerings with the resources that can take them,
// business hours and price overrides — shaped for the pure lib/ functions.

export type BookableOffering = {
  id: string;
  slug: string;
  name: string;
  mode: "WINDOW" | "SLOT";
  startMinute: number | null;
  endMinute: number | null;
  endsNextDay: boolean;
  durationMin: number | null;
  slotStepMin: number | null;
  bufferMin: number;
  basePrice: string;
  weekendPrice: string | null;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: string;
  /** Active resources, in preference order ("any staff" takes the first free one). */
  resourceIds: string[];
};

export async function findBookableOffering(where: { slug: string } | { id: string }): Promise<BookableOffering | null> {
  const offering = await db.offering.findFirst({
    where: { ...where, isActive: true },
    include: {
      resources: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
        select: { id: true },
      },
    },
  });
  if (!offering) return null;
  return {
    id: offering.id,
    slug: offering.slug,
    name: offering.name,
    mode: offering.mode,
    startMinute: offering.startMinute,
    endMinute: offering.endMinute,
    endsNextDay: offering.endsNextDay,
    durationMin: offering.durationMin,
    slotStepMin: offering.slotStepMin,
    bufferMin: offering.bufferMin,
    basePrice: offering.basePrice.toString(),
    weekendPrice: offering.weekendPrice?.toString() ?? null,
    includedGuests: offering.includedGuests,
    maxGuests: offering.maxGuests,
    extraGuestFee: offering.extraGuestFee.toString(),
    resourceIds: offering.resources.map((r) => r.id),
  };
}

/** Business-wide rows plus the rows of the given resources. */
export async function loadHours(resourceIds: readonly string[]): Promise<HoursRow[]> {
  return db.businessHours.findMany({
    where: { OR: [{ resourceId: null }, { resourceId: { in: [...resourceIds] } }] },
    select: { resourceId: true, weekday: true, openMinute: true, closeMinute: true },
  });
}

const toLocalDate = (value: Date): LocalDate => value.toISOString().slice(0, 10);

/** Overrides that could apply to this offering on `date` (resource matching happens in lib/pricing). */
export async function loadOverrides(offeringId: string, date: LocalDate): Promise<PricingOverride[]> {
  const day = new Date(`${date}T00:00:00Z`);
  const rows = await db.pricingOverride.findMany({
    where: {
      startDate: { lte: day },
      endDate: { gte: day },
      OR: [{ offeringId: null }, { offeringId }],
    },
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    resourceId: row.resourceId,
    offeringId: row.offeringId,
    startDate: toLocalDate(row.startDate),
    endDate: toLocalDate(row.endDate),
    fixedPrice: row.fixedPrice?.toString() ?? null,
    multiplier: row.multiplier?.toString() ?? null,
    createdAt: row.createdAt,
  }));
}
