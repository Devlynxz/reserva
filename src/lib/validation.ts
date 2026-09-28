import { z } from "zod";
import { BOOKING_STATUSES } from "./booking-status";
import { normalizeHex } from "./color";
import { isValidLocalDate, isValidTimeZone, parseTime } from "./dates";
import { isSupportedCurrency } from "./money";
import { normalizeReferenceCode } from "./reference-code";

// Every input boundary parses through one of these schemas: forms, server actions,
// route handlers. Public schemas are `.strict()` — an unexpected key (say, `price`) is
// rejected outright instead of silently ignored, so tampering is visible in logs.

// ─── Primitives ──────────────────────────────────────────────────────────────

export const localDateSchema = z.string().refine(isValidLocalDate, "Enter a valid date (YYYY-MM-DD).");

/** "HH:mm" → minute of day. */
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-4]):[0-5]\d$/, "Enter a time like 09:30.")
  .refine((v) => v <= "24:00", "Enter a time like 09:30.")
  .transform(parseTime);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter an email address like name@example.com.").max(254));

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[\d\s()-]{7,20}$/, "Enter a phone number with digits only, like 0917 123 4567.");

export const personNameSchema = z.string().trim().min(1, "Enter your name.").max(120, "Use at most 120 characters.");

export const slugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes.")
  .max(60);

export const idSchema = z.uuid("Invalid id.");

/** Money typed by an admin: up to 10 digits, 2 decimals, no sign. Stays a string (→ Decimal). */
export const amountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount like 2500 or 2500.50.");

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isSupportedCurrency, "Use a 3-letter currency code with at most 2 decimals, like PHP or USD.");

export const timeZoneSchema = z.string().trim().refine(isValidTimeZone, "Unknown time zone.");

export const hexColorSchema = z
  .string()
  .transform((v, ctx) => normalizeHex(v) ?? (ctx.addIssue({ code: "custom", message: "Use a hex color like #2e7d6b." }), z.NEVER));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

// ─── Public ──────────────────────────────────────────────────────────────────

/** A new online booking. No price, status or source: the server decides those. */
export const bookingRequestSchema = z
  .object({
    offeringSlug: slugSchema,
    /** A specific resource, or "any" for the first free one (e.g. any stylist). */
    resourceId: z.union([idSchema, z.literal("any")]),
    date: localDateSchema,
    /** SLOT offerings only. */
    startTime: timeSchema.optional(),
    guestCount: z.coerce.number().int().min(1, "At least 1 guest.").max(500),
    customer: z
      .object({
        name: personNameSchema,
        email: emailSchema,
        phone: phoneSchema.optional(),
      })
      .strict(),
    notes: optionalText(1000),
  })
  .strict();

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

/** The choice being priced on the review step: a booking request without the customer. */
export const bookingSelectionSchema = bookingRequestSchema.omit({ customer: true, notes: true });
export type BookingSelectionInput = z.infer<typeof bookingSelectionSchema>;

/**
 * The request shape depends on the offering's mode, known only after loading the offering.
 * Returns the problem to show the customer, or null when the fields fit the mode.
 */
export function modeFieldError(mode: "WINDOW" | "SLOT", request: Pick<BookingRequest, "startTime">): string | null {
  if (mode === "SLOT" && request.startTime === undefined) return "Pick a time.";
  if (mode === "WINDOW" && request.startTime !== undefined) return "This package has a fixed time; pick a date only.";
  return null;
}

export const lookupSchema = z
  .object({
    reference: z
      .string()
      .transform((v, ctx) => normalizeReferenceCode(v) ?? (ctx.addIssue({ code: "custom", message: "Enter a reference like RSV-7K3Q9." }), z.NEVER)),
    email: emailSchema,
  })
  .strict();

export const availabilityQuerySchema = z
  .object({
    offering: slugSchema,
    from: localDateSchema,
    to: localDateSchema,
  })
  .strict()
  .refine((q) => q.from <= q.to, { message: "`from` must not be after `to`.", path: ["to"] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 62 * 86_400_000, {
    message: "Ask for at most 62 days at a time.",
    path: ["to"],
  });

// ─── Admin ───────────────────────────────────────────────────────────────────

export const resourceInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, "Enter a name.").max(80),
  type: z.enum(["SPACE", "STAFF"]),
  description: optionalText(2000),
  capacity: z.coerce.number().int().min(1).max(10_000).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

const offeringBase = {
  slug: slugSchema,
  name: z.string().trim().min(1, "Enter a name.").max(80),
  description: optionalText(2000),
  resourceIds: z.array(idSchema).min(1, "Choose at least one resource."),
  bufferMin: z.coerce.number().int().min(0).max(24 * 60).default(0),
  basePrice: amountSchema,
  weekendPrice: amountSchema.optional(),
  includedGuests: z.coerce.number().int().min(1).max(500),
  maxGuests: z.coerce.number().int().min(1).max(500),
  extraGuestFee: amountSchema.default("0"),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
};

export const offeringInputSchema = z
  .discriminatedUnion("mode", [
    z.object({ ...offeringBase, mode: z.literal("WINDOW"), startTime: timeSchema, endTime: timeSchema }),
    z.object({
      ...offeringBase,
      mode: z.literal("SLOT"),
      durationMin: z.coerce.number().int().min(5).max(24 * 60),
      slotStepMin: z.coerce.number().int().min(5).max(24 * 60),
    }),
  ])
  .refine((o) => o.maxGuests >= o.includedGuests, {
    message: "Max guests can't be less than included guests.",
    path: ["maxGuests"],
  })
  .refine((o) => o.mode !== "WINDOW" || (o.startTime < 1440 && o.endTime < 1440), {
    message: "Use a time before 24:00.",
    path: ["endTime"],
  })
  .transform((o) =>
    o.mode === "WINDOW"
      ? { ...o, startMinute: o.startTime, endMinute: o.endTime, endsNextDay: o.endTime <= o.startTime }
      : o,
  );

export const businessHoursInputSchema = z
  .object({
    resourceId: idSchema.nullable(),
    weekday: z.coerce.number().int().min(0).max(6),
    openTime: timeSchema,
    closeTime: timeSchema,
  })
  .refine((h) => h.closeTime > h.openTime, { message: "Closing must be after opening.", path: ["closeTime"] })
  .transform(({ openTime, closeTime, ...rest }) => ({ ...rest, openMinute: openTime, closeMinute: closeTime }));

export const pricingOverrideInputSchema = z
  .object({
    label: z.string().trim().min(1, "Name this rate, e.g. Holy Week.").max(80),
    resourceId: idSchema.nullable(),
    offeringId: idSchema.nullable(),
    startDate: localDateSchema,
    endDate: localDateSchema,
    fixedPrice: amountSchema.optional(),
    multiplier: z
      .string()
      .trim()
      .regex(/^\d{1,3}(\.\d{1,3})?$/, "Enter a multiplier like 1.5.")
      .refine((v) => Number(v) > 0, "The multiplier must be above 0.")
      .optional(),
  })
  .refine((o) => o.endDate >= o.startDate, { message: "End date can't be before the start date.", path: ["endDate"] })
  .refine((o) => (o.fixedPrice === undefined) !== (o.multiplier === undefined), {
    message: "Set either a fixed price or a multiplier, not both.",
    path: ["fixedPrice"],
  });

export const blockedPeriodInputSchema = z
  .object({
    resourceId: idSchema.nullable(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: optionalText(200),
  })
  .refine((b) => b.endAt.getTime() > b.startAt.getTime(), { message: "End must be after start.", path: ["endAt"] });

export const settingsInputSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  tagline: optionalText(140),
  brandColor: hexColorSchema,
  currency: currencySchema,
  timezone: timeZoneSchema,
  depositPercent: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 50.")
    .refine((v) => Number(v) > 0 && Number(v) <= 100, "Use a deposit above 0% and at most 100%."),
  holdMinutes: z.coerce.number().int().min(5).max(1440),
  weekendDays: z
    .array(z.coerce.number().int().min(0).max(6))
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Each weekday once."),
  leadTimeMin: z.coerce.number().int().min(0).max(60 * 24 * 30),
  maxAdvanceDays: z.coerce.number().int().min(1).max(730),
  contactEmail: emailSchema.optional(),
  contactPhone: phoneSchema.optional(),
  address: optionalText(300),
  policies: optionalText(10_000),
  showPoweredBy: z.boolean().default(true),
});

/** Walk-in / message booking entered by staff. Same engine, different entry point. */
export const manualBookingSchema = z
  .object({
    source: z.enum(["WALK_IN", "MESSAGE"]),
    offeringId: idSchema,
    resourceId: z.union([idSchema, z.literal("any")]),
    date: localDateSchema,
    startTime: timeSchema.optional(),
    guestCount: z.coerce.number().int().min(1).max(500),
    customer: z.object({ name: personNameSchema, email: emailSchema, phone: phoneSchema.optional() }),
    customerNotes: optionalText(1000),
    internalNotes: optionalText(2000),
    /** Keep it pending (no hold) until staff records payment. */
    awaitingPayment: z.boolean().default(false),
  })
  .strict();

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

export const recordPaymentSchema = z.object({
  bookingId: idSchema,
  amount: amountSchema.refine((v) => Number(v) > 0, "Enter an amount above 0."),
  method: z.enum(["cash", "bank_transfer", "gcash", "maya", "card", "other"]),
  note: optionalText(500),
});
