"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { addDays, zonedToUtc } from "@/lib/dates";
import {
  businessHoursInputSchema,
  idSchema,
  localDateSchema,
  offeringInputSchema,
  pricingOverrideInputSchema,
  resourceInputSchema,
  timeSchema,
} from "@/lib/validation";
import { addHours, createOverride, deleteHours, deleteOverride, saveOffering, saveResource } from "../../data/admin-catalog";
import { createBlockedPeriod, deleteBlockedPeriod } from "../../data/blocked-periods";
import { getSettings } from "../../data/settings";
import { type FormState, failure, formObject, guard, invalid, isSession } from "./form";

// Catalog CRUD. Each action re-checks the caller's area: forms are just HTTP endpoints.

// ─── Resources ──────────────────────────────────────────────────────────────

export async function saveResourceAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("resources");
  if (!isSession(session)) return session;
  const parsed = resourceInputSchema.safeParse(formObject(formData, { booleans: ["isActive"] }));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await saveResource(parsed.data, id ?? undefined);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/resources");
  if (!id) redirect("/admin/resources");
  return { ok: true, message: "Saved." };
}

// ─── Offerings ──────────────────────────────────────────────────────────────

export async function saveOfferingAction(id: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("offerings");
  if (!isSession(session)) return session;
  const raw = formObject(formData, { booleans: ["isActive"], multi: ["resourceIds"] });
  const modeFields =
    raw.mode === "WINDOW" ? { startTime: raw.startTime, endTime: raw.endTime } : { durationMin: raw.durationMin, slotStepMin: raw.slotStepMin };
  const parsed = offeringInputSchema.safeParse({
    mode: raw.mode,
    slug: raw.slug,
    name: raw.name,
    description: raw.description,
    resourceIds: raw.resourceIds,
    bufferMin: raw.bufferMin,
    basePrice: raw.basePrice,
    weekendPrice: raw.weekendPrice,
    includedGuests: raw.includedGuests,
    maxGuests: raw.maxGuests,
    extraGuestFee: raw.extraGuestFee,
    isActive: raw.isActive,
    sortOrder: raw.sortOrder,
    ...modeFields,
  });
  if (!parsed.success) return invalid(parsed.error);
  const o = parsed.data;
  try {
    await saveOffering(
      {
        slug: o.slug,
        name: o.name,
        description: o.description,
        mode: o.mode,
        ...(o.mode === "WINDOW"
          ? { startMinute: o.startMinute, endMinute: o.endMinute, endsNextDay: o.endsNextDay }
          : { durationMin: o.durationMin, slotStepMin: o.slotStepMin }),
        bufferMin: o.bufferMin,
        basePrice: o.basePrice,
        weekendPrice: o.weekendPrice,
        includedGuests: o.includedGuests,
        maxGuests: o.maxGuests,
        extraGuestFee: o.extraGuestFee,
        isActive: o.isActive,
        sortOrder: o.sortOrder,
        resourceIds: o.resourceIds,
      },
      id ?? undefined,
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/offerings");
  if (!id) redirect("/admin/offerings");
  return { ok: true, message: "Saved." };
}

// ─── Hours ──────────────────────────────────────────────────────────────────

export async function addHoursAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("hours");
  if (!isSession(session)) return session;
  const raw = formObject(formData, { multi: ["weekdays"] });
  const weekdays = (raw.weekdays as string[]).length > 0 ? (raw.weekdays as string[]) : [];
  if (weekdays.length === 0) return { error: "Choose at least one day.", fieldErrors: { weekdays: "Choose at least one day." } };
  try {
    for (const weekday of weekdays) {
      const parsed = businessHoursInputSchema.safeParse({ resourceId: raw.resourceId ?? null, weekday, openTime: raw.openTime, closeTime: raw.closeTime });
      if (!parsed.success) return invalid(parsed.error);
      await addHours(parsed.data);
    }
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/hours");
  return { ok: true, message: "Hours added." };
}

export async function deleteHoursAction(id: string): Promise<FormState> {
  const session = await guard("hours");
  if (!isSession(session)) return session;
  await deleteHours(idSchema.parse(id));
  revalidatePath("/admin/hours");
  return { ok: true };
}

// ─── Price overrides ────────────────────────────────────────────────────────

export async function createOverrideAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("pricing");
  if (!isSession(session)) return session;
  const raw = formObject(formData);
  const parsed = pricingOverrideInputSchema.safeParse({
    label: raw.label,
    resourceId: raw.resourceId ?? null,
    offeringId: raw.offeringId ?? null,
    startDate: raw.startDate,
    endDate: raw.endDate,
    ...(raw.rule === "fixed" ? { fixedPrice: raw.value } : { multiplier: raw.value }),
  });
  if (!parsed.success) {
    const state = invalid(parsed.error);
    for (const key of ["fixedPrice", "multiplier"]) if (state.fieldErrors?.[key]) state.fieldErrors.value = state.fieldErrors[key];
    return state;
  }
  try {
    await createOverride(parsed.data);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/pricing");
  return { ok: true, message: "Rate added." };
}

export async function deleteOverrideAction(id: string): Promise<FormState> {
  const session = await guard("pricing");
  if (!isSession(session)) return session;
  await deleteOverride(idSchema.parse(id));
  revalidatePath("/admin/pricing");
  return { ok: true };
}

// ─── Blocked periods ────────────────────────────────────────────────────────

const blockForm = z
  .object({
    resourceId: idSchema.optional(),
    startDate: localDateSchema,
    startTime: timeSchema.default(0),
    endDate: localDateSchema,
    endTime: timeSchema.default(1440),
    reason: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.endDate > b.startDate || (b.endDate === b.startDate && b.endTime > b.startTime), {
    message: "The end must be after the start.",
    path: ["endDate"],
  });

export async function createBlockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await guard("blocked");
  if (!isSession(session)) return session;
  const parsed = blockForm.safeParse(formObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  const b = parsed.data;
  const { timezone } = await getSettings();
  // Times are business-local. "24:00" means the end of that day.
  const toInstant = (date: string, minute: number) => (minute === 1440 ? zonedToUtc(addDays(date, 1), 0, timezone) : zonedToUtc(date, minute, timezone));
  try {
    await createBlockedPeriod({
      resourceId: b.resourceId ?? null,
      startAt: toInstant(b.startDate, b.startTime),
      endAt: toInstant(b.endDate, b.endTime),
      reason: b.reason,
      actorId: session.userId,
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/blocked");
  return { ok: true, message: "Blocked." };
}

export async function deleteBlockAction(id: string): Promise<FormState> {
  const session = await guard("blocked");
  if (!isSession(session)) return session;
  await deleteBlockedPeriod(idSchema.parse(id));
  revalidatePath("/admin/blocked");
  return { ok: true };
}
