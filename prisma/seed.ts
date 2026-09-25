// Seeds a demo business: `SEED_PRESET=resort|court|salon npm run db:seed`.
//
// WIPES the database first. Refuses to run with NODE_ENV=production unless
// SEED_ALLOW_RESET=true. Seeded logins use SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD
// (required in production; demo defaults otherwise).
//
// Bookings are generated deterministically (same preset + same day → same data), priced
// with lib/pricing, and inserted through the real constraints and triggers; every status
// history is checked against lib/booking-status.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { config } from "dotenv";
import { type BlockSpan, type BusySpan, isResourceFree } from "@/lib/availability";
import { type Actor, type BookingSource, type BookingStatus, assertTransition } from "@/lib/booking-status";
import { type LocalDate, addDays, addMinutes, isRealLocalTime, localDateOf, parseTime, weekdayOf, zonedToUtc } from "@/lib/dates";
import type { BookingSpan } from "@/lib/intervals";
import { money, sum, toAmountString } from "@/lib/money";
import { type PricingOverride, quote, toPriceBreakdown } from "@/lib/pricing";
import { generateReferenceCode } from "@/lib/reference-code";
import { type HoursRow, hoursFor, slotGrid, slotSpan } from "@/lib/slots";
import { windowSpan } from "@/lib/windows";
import { PrismaClient } from "../src/generated/prisma/client";
import { court } from "./seeds/court";
import { resort } from "./seeds/resort";
import { salon } from "./seeds/salon";
import type { SeedOffering, SeedPresetDefinition } from "./seeds/types";

config({ quiet: true });

const PRESETS: Record<string, SeedPresetDefinition> = { resort, court, salon };
const TARGET_BOOKINGS = 15;
const DAY_RANGE = { from: -20, to: 40 }; // ~60 days around today

// ─── Deterministic randomness ───────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFrom(text: string): number {
  return createHash("sha256").update(text).digest().readUInt32BE(0);
}

// ─── Setup ──────────────────────────────────────────────────────────────────

function readPasswords() {
  const production = process.env.NODE_ENV === "production";
  const admin = process.env.SEED_ADMIN_PASSWORD || (production ? undefined : "reserva-admin-demo");
  const staff = process.env.SEED_STAFF_PASSWORD || (production ? undefined : "reserva-staff-demo");
  if (!admin || !staff) throw new Error("Set SEED_ADMIN_PASSWORD and SEED_STAFF_PASSWORD to seed in production.");
  if (admin.length < 12 || staff.length < 12) throw new Error("Seed passwords must be at least 12 characters.");
  return { admin, staff };
}

async function wipe(db: PrismaClient) {
  await db.$executeRawUnsafe(`
    TRUNCATE booking_events, payments, bookings, blocked_periods, pricing_overrides, business_hours,
             "_OfferingToResource", offerings, resources, settings, rate_limits,
             session, account, verification, "user"
    RESTART IDENTITY CASCADE`);
}

async function createUser(db: PrismaClient, user: { name: string; email: string }, role: "ADMIN" | "STAFF", password: string) {
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      name: user.name,
      email: user.email,
      emailVerified: true,
      role,
      // Better Auth's credential account: accountId = user id, scrypt hash from better-auth/crypto.
      accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: await hashPassword(password) } },
    },
  });
  return id;
}

type OfferingRow = { id: string; seed: SeedOffering; resourceIds: string[] };

// ─── Booking plan ───────────────────────────────────────────────────────────

type PlannedEvent = { from: BookingStatus | null; to: BookingStatus; actor: Actor; at: Date; staff: boolean; note: string };
type PlannedPayment = { provider: "PAYMONGO" | "STRIPE" | "MANUAL"; method: string; amount: string; at: Date; staff: boolean };

function spanFor(offering: OfferingRow, resourceId: string, date: LocalDate, hours: HoursRow[], tz: string, rng: () => number): BookingSpan | null {
  const o = offering.seed;
  if (o.mode === "WINDOW") {
    const startMinute = parseTime(o.start);
    const endMinute = parseTime(o.end);
    return windowSpan({ startMinute, endMinute, endsNextDay: endMinute <= startMinute, bufferMin: o.bufferMin }, date, tz);
  }
  const slot = { durationMin: o.durationMin, slotStepMin: o.slotStepMin, bufferMin: o.bufferMin };
  const grid = slotGrid(hoursFor(resourceId, weekdayOf(date), hours), slot).filter((m) => isRealLocalTime(date, m, tz));
  if (grid.length === 0) return null; // closed that day
  return slotSpan(slot, date, grid[Math.floor(rng() * grid.length)]!, tz);
}

function planHistory(input: {
  span: BookingSpan;
  now: Date;
  rng: () => number;
  leadTimeMin: number;
}): { source: BookingSource; status: BookingStatus; events: PlannedEvent[]; createdAt: Date } | null {
  const { span, now, rng } = input;
  const bookedDaysBefore = 1 + Math.floor(rng() * 20);
  const createdAt = new Date(Math.min(addMinutes(span.startAt, -bookedDaysBefore * 1440 - Math.floor(rng() * 600)).getTime(), now.getTime() - 3_600_000));
  const past = span.endAt.getTime() <= now.getTime();
  const upcoming = span.startAt.getTime() > now.getTime();
  const roll = rng();

  const source: BookingSource = upcoming
    ? roll < 0.75 ? "ONLINE" : "MESSAGE"
    : roll < 0.6 ? "ONLINE" : roll < 0.8 ? "WALK_IN" : "MESSAGE";
  const createdAtFinal = source === "WALK_IN" ? addMinutes(span.startAt, -30) : createdAt;
  if (createdAtFinal.getTime() > now.getTime()) return null;

  const events: PlannedEvent[] = [];
  if (source === "ONLINE") {
    events.push({ from: null, to: "PENDING_PAYMENT", actor: "customer", at: createdAtFinal, staff: false, note: "Created (online)" });
    const bookable = span.startAt.getTime() >= now.getTime() + input.leadTimeMin * 60_000;
    // A couple of fresh online bookings are still waiting on payment.
    if (upcoming && bookable && rng() < 0.2) {
      return { source, status: "PENDING_PAYMENT", events: [{ ...events[0]!, at: addMinutes(now, -2) }], createdAt: addMinutes(now, -2) };
    }
    events.push({ from: "PENDING_PAYMENT", to: "CONFIRMED", actor: "webhook", at: addMinutes(createdAtFinal, 4), staff: false, note: "Deposit paid online" });
  } else {
    events.push({ from: null, to: "CONFIRMED", actor: "staff", at: createdAtFinal, staff: true, note: `Created (${source === "WALK_IN" ? "walk-in" : "message"})` });
  }
  const final = rng();
  if (past) {
    if (final < 0.1) events.push({ from: "CONFIRMED", to: "CANCELLED", actor: "staff", at: addMinutes(createdAtFinal, 60), staff: true, note: "Guest asked to cancel" });
    else if (final < 0.2) events.push({ from: "CONFIRMED", to: "NO_SHOW", actor: "staff", at: addMinutes(span.startAt, 60), staff: true, note: "Guest didn't arrive" });
    else events.push({ from: "CONFIRMED", to: "COMPLETED", actor: "staff", at: span.endAt, staff: true, note: "Checked out" });
  } else if (upcoming && final < 0.12) {
    events.push({ from: "CONFIRMED", to: "CANCELLED", actor: "staff", at: new Date(Math.min(addMinutes(createdAtFinal, 2880).getTime(), now.getTime())), staff: true, note: "Rescheduling; will rebook" });
  }
  const status = events.at(-1)!.to;
  // Every seeded history must be one the real state machine allows.
  for (const e of events.slice(1)) assertTransition(e.from!, e.to, e.actor, { now: e.at, startAt: span.startAt });
  return { source, status, events, createdAt: createdAtFinal };
}

function planPayments(input: {
  source: BookingSource;
  status: BookingStatus;
  events: PlannedEvent[];
  total: string;
  deposit: string;
  currency: string;
  startAt: Date;
  rng: () => number;
}): PlannedPayment[] {
  const { source, status, events, total, deposit, currency, rng } = input;
  if (status === "PENDING_PAYMENT") return [];
  const payments: PlannedPayment[] = [];
  const onlineProvider = currency === "PHP" ? "PAYMONGO" : "STRIPE";
  const methods = currency === "PHP" ? ["gcash", "maya", "card"] : ["card"];
  const balance = money(total).minus(money(deposit));

  if (source === "ONLINE") {
    payments.push({ provider: onlineProvider, method: methods[Math.floor(rng() * methods.length)]!, amount: deposit, at: events[1]!.at, staff: false });
  } else if (source === "MESSAGE") {
    payments.push({ provider: "MANUAL", method: "bank_transfer", amount: deposit, at: events[0]!.at, staff: true });
  } else {
    payments.push({ provider: "MANUAL", method: "cash", amount: total, at: events[0]!.at, staff: true });
    return payments;
  }
  if (status === "COMPLETED" && balance.gt(0)) {
    payments.push({ provider: "MANUAL", method: "cash", amount: toAmountString(balance, currency), at: input.startAt, staff: true });
  }
  return payments;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const presetName = process.env.SEED_PRESET || "resort";
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown SEED_PRESET "${presetName}". Use one of: ${Object.keys(PRESETS).join(", ")}.`);
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_RESET !== "true") {
    throw new Error("Seeding wipes the database. Set SEED_ALLOW_RESET=true to do that in production.");
  }
  const passwords = readPasswords();
  const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DATABASE_URL (and ideally DATABASE_URL_UNPOOLED).");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const { settings } = preset;
    const tz = settings.timezone;
    const now = new Date();
    const today = localDateOf(now, tz);
    const rng = mulberry32(seedFrom(`${presetName}:${today}`));

    await wipe(db);
    await db.settings.create({
      data: {
        id: 1,
        ...settings,
      },
    });

    const resourceIds = new Map<string, string>();
    for (const [sortOrder, r] of preset.resources.entries()) {
      const row = await db.resource.create({
        data: { slug: r.key, name: r.name, type: r.type, description: r.description, capacity: r.capacity ?? null, sortOrder },
      });
      resourceIds.set(r.key, row.id);
    }
    const idOf = (key: string) => {
      const id = resourceIds.get(key);
      if (!id) throw new Error(`Unknown resource key "${key}"`);
      return id;
    };

    const offerings: OfferingRow[] = [];
    for (const [sortOrder, o] of preset.offerings.entries()) {
      const ids = o.resourceKeys.map(idOf);
      const timing =
        o.mode === "WINDOW"
          ? (() => {
              const startMinute = parseTime(o.start);
              const endMinute = parseTime(o.end);
              return { startMinute, endMinute, endsNextDay: endMinute <= startMinute };
            })()
          : { durationMin: o.durationMin, slotStepMin: o.slotStepMin };
      const row = await db.offering.create({
        data: {
          slug: o.key,
          name: o.name,
          description: o.description,
          mode: o.mode,
          ...timing,
          bufferMin: o.bufferMin,
          basePrice: o.basePrice,
          weekendPrice: o.weekendPrice ?? null,
          includedGuests: o.includedGuests,
          maxGuests: o.maxGuests,
          extraGuestFee: o.extraGuestFee ?? "0",
          sortOrder,
          resources: { connect: ids.map((id) => ({ id })) },
        },
      });
      offerings.push({ id: row.id, seed: o, resourceIds: ids });
    }

    const hours: HoursRow[] = preset.hours.flatMap((h) =>
      h.weekdays.map((weekday) => ({
        resourceId: h.resourceKey ? idOf(h.resourceKey) : null,
        weekday,
        openMinute: parseTime(h.open),
        closeMinute: parseTime(h.close),
      })),
    );
    if (hours.length > 0) await db.businessHours.createMany({ data: hours });

    const overrides: PricingOverride[] = [];
    for (const o of preset.overrides(today)) {
      const row = await db.pricingOverride.create({
        data: {
          label: o.label,
          startDate: new Date(`${o.startDate}T00:00:00Z`),
          endDate: new Date(`${o.endDate}T00:00:00Z`),
          multiplier: o.multiplier ?? null,
          fixedPrice: o.fixedPrice ?? null,
          offeringId: o.offeringKey ? offerings.find((x) => x.seed.key === o.offeringKey)!.id : null,
          resourceId: o.resourceKey ? idOf(o.resourceKey) : null,
        },
      });
      overrides.push({
        id: row.id,
        label: row.label,
        resourceId: row.resourceId,
        offeringId: row.offeringId,
        startDate: o.startDate,
        endDate: o.endDate,
        fixedPrice: o.fixedPrice ?? null,
        multiplier: o.multiplier ?? null,
        createdAt: row.createdAt,
      });
    }

    const blocked: BlockSpan[] = [];
    for (const b of preset.blocks) {
      const date = addDays(today, b.dayOffset);
      const row = await db.blockedPeriod.create({
        data: { resourceId: b.resourceKey ? idOf(b.resourceKey) : null, startAt: zonedToUtc(date, 0, tz), endAt: zonedToUtc(addDays(date, 1), 0, tz), reason: b.reason },
      });
      blocked.push({ resourceId: row.resourceId, startAt: row.startAt, endAt: row.endAt });
    }

    const adminId = await createUser(db, preset.users.admin, "ADMIN", passwords.admin);
    const staffId = await createUser(db, preset.users.staff, "STAFF", passwords.staff);

    // ── Bookings ──
    const occupied: BusySpan[] = [];
    const references = new Set<string>();
    let created = 0;
    for (let attempt = 0; created < TARGET_BOOKINGS && attempt < 500; attempt++) {
      const offering = offerings[Math.floor(rng() * offerings.length)]!;
      const resourceId = offering.resourceIds[Math.floor(rng() * offering.resourceIds.length)]!;
      const date = addDays(today, DAY_RANGE.from + Math.floor(rng() * (DAY_RANGE.to - DAY_RANGE.from + 1)));
      const span = spanFor(offering, resourceId, date, hours, tz, rng);
      if (!span || !isResourceFree(resourceId, span, occupied, blocked)) continue;

      const history = planHistory({ span, now, rng, leadTimeMin: settings.leadTimeMin });
      if (!history) continue;

      const o = offering.seed;
      const guestCount = Math.min(o.maxGuests, o.includedGuests + (rng() < 0.4 ? 1 + Math.floor(rng() * 5) : 0));
      const price = quote({
        offering: { id: offering.id, basePrice: o.basePrice, weekendPrice: o.weekendPrice ?? null, includedGuests: o.includedGuests, maxGuests: o.maxGuests, extraGuestFee: o.extraGuestFee ?? "0" },
        resourceId,
        date,
        guestCount,
        overrides,
        weekendDays: settings.weekendDays,
        depositPercent: settings.depositPercent,
        currency: settings.currency,
      });
      const total = toAmountString(price.total, settings.currency);
      const deposit = toAmountString(price.deposit, settings.currency);
      const payments = planPayments({ ...history, total, deposit, currency: settings.currency, startAt: span.startAt, rng });
      const amountPaid = toAmountString(sum(payments.map((p) => p.amount)), settings.currency);

      let referenceCode = generateReferenceCode();
      while (references.has(referenceCode)) referenceCode = generateReferenceCode();
      references.add(referenceCode);

      const name = preset.customers[created % preset.customers.length]!;
      const booking = await db.booking.create({
        data: {
          referenceCode,
          // Seeded bookings have no working link; /lookup (reference + email) issues one.
          accessTokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
          resourceId,
          offeringId: offering.id,
          startAt: span.startAt,
          endAt: span.endAt,
          occupiedUntil: span.occupiedUntil,
          customerName: name,
          customerEmail: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
          customerPhone: `+63 9${String(10 + Math.floor(rng() * 89))} ${String(100 + Math.floor(rng() * 899))} ${String(1000 + Math.floor(rng() * 8999))}`,
          guestCount,
          customerNotes: rng() < 0.3 ? "Celebrating a birthday — can we arrive a bit early?" : null,
          internalNotes: history.source === "MESSAGE" ? "Booked through Facebook Messenger." : null,
          totalAmount: total,
          depositAmount: deposit,
          amountPaid,
          currency: settings.currency,
          priceBreakdown: toPriceBreakdown(price),
          status: history.status,
          source: history.source,
          holdExpiresAt: history.status === "PENDING_PAYMENT" ? addMinutes(now, settings.holdMinutes) : null,
          paymentProvider: history.source === "ONLINE" ? (settings.currency === "PHP" ? "PAYMONGO" : "STRIPE") : null,
          createdAt: history.createdAt,
        },
      });
      await db.bookingEvent.createMany({
        data: history.events.map((e) => ({
          bookingId: booking.id,
          fromStatus: e.from,
          toStatus: e.to,
          actorId: e.staff ? (e.to === "CANCELLED" ? adminId : staffId) : null,
          note: e.note,
          createdAt: e.at,
        })),
      });
      if (payments.length > 0) {
        await db.payment.createMany({
          data: payments.map((p, i) => ({
            bookingId: booking.id,
            provider: p.provider,
            providerRef: p.provider === "MANUAL" ? null : `pay_seed_${booking.referenceCode}_${i}`,
            providerEventId: p.provider === "MANUAL" ? null : `evt_seed_${booking.referenceCode}_${i}`,
            amount: p.amount,
            currency: settings.currency,
            method: p.method,
            status: "SUCCEEDED" as const,
            recordedById: p.staff ? staffId : null,
            createdAt: p.at,
          })),
        });
      }
      if (history.status !== "CANCELLED") occupied.push({ resourceId, startAt: span.startAt, occupiedUntil: span.occupiedUntil });
      created++;
    }

    const byStatus = await db.booking.groupBy({ by: ["status"], _count: true });
    console.info(`Seeded "${presetName}" — ${settings.businessName}`);
    console.info(`  ${preset.resources.length} resources, ${preset.offerings.length} offerings, ${created} bookings (${byStatus.map((s) => `${s._count} ${s.status}`).join(", ")})`);
    console.info(`  Admin: ${preset.users.admin.email}  Staff: ${preset.users.staff.email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) console.info("  Demo passwords: reserva-admin-demo / reserva-staff-demo");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
