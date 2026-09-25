import { describe } from "vitest";
import { db } from "@/server/data/db";

// Helpers for database-backed suites. See vitest.config.mts: these only ever run
// against TEST_DATABASE_URL.

export const hasTestDb = Boolean(process.env.TEST_DATABASE_URL);

/** `describe` when a test database is configured, `describe.skip` otherwise. */
export const describeDb = hasTestDb ? describe : describe.skip;

export { db };

export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(`
    TRUNCATE booking_events, payments, bookings, blocked_periods, pricing_overrides, business_hours,
             "_OfferingToResource", offerings, resources, settings, rate_limits,
             session, account, verification, "user"
    RESTART IDENTITY CASCADE`);
}

export const TZ = "Asia/Manila";

/** Local Manila time → instant. `at("2030-04-06", "10:00")`. */
export function at(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+08:00`);
}

/** A fixed "now" well before the test dates, so lead time / horizon never interfere. */
export const NOW = at("2030-04-01", "08:00");

export async function seedSettings(overrides: Partial<Parameters<typeof db.settings.create>[0]["data"]> = {}) {
  return db.settings.create({
    data: {
      id: 1,
      businessName: "Test Resort",
      currency: "PHP",
      timezone: TZ,
      depositPercent: "50",
      holdMinutes: 15,
      weekendDays: [5, 6],
      leadTimeMin: 0,
      maxAdvanceDays: 365,
      ...overrides,
    },
  });
}

let counter = 0;
const unique = (prefix: string) => `${prefix}-${++counter}`;

export async function createResource(data: { name?: string; type?: "SPACE" | "STAFF"; sortOrder?: number } = {}) {
  const name = data.name ?? unique("resource");
  return db.resource.create({
    data: { name, slug: unique(name.toLowerCase().replace(/\s+/g, "-")), type: data.type ?? "SPACE", sortOrder: data.sortOrder ?? 0 },
  });
}

type OfferingBase = { resourceIds: string[]; slug?: string; basePrice?: string; bufferMin?: number; maxGuests?: number };

export async function createWindowOffering(
  data: OfferingBase & { startMinute: number; endMinute: number },
) {
  return db.offering.create({
    data: {
      slug: data.slug ?? unique("window"),
      name: data.slug ?? "Window offering",
      mode: "WINDOW",
      startMinute: data.startMinute,
      endMinute: data.endMinute,
      endsNextDay: data.endMinute <= data.startMinute,
      bufferMin: data.bufferMin ?? 0,
      basePrice: data.basePrice ?? "10000",
      includedGuests: 1,
      maxGuests: data.maxGuests ?? 20,
      resources: { connect: data.resourceIds.map((id) => ({ id })) },
    },
  });
}

export async function createSlotOffering(data: OfferingBase & { durationMin: number; slotStepMin?: number }) {
  return db.offering.create({
    data: {
      slug: data.slug ?? unique("slot"),
      name: data.slug ?? "Slot offering",
      mode: "SLOT",
      durationMin: data.durationMin,
      slotStepMin: data.slotStepMin ?? data.durationMin,
      bufferMin: data.bufferMin ?? 0,
      basePrice: data.basePrice ?? "500",
      includedGuests: 1,
      maxGuests: data.maxGuests ?? 4,
      resources: { connect: data.resourceIds.map((id) => ({ id })) },
    },
  });
}

/** Open every day, 06:00–22:00, business-wide. */
export async function openEveryDay(openMinute = 6 * 60, closeMinute = 22 * 60) {
  await db.businessHours.createMany({
    data: Array.from({ length: 7 }, (_, weekday) => ({ resourceId: null, weekday, openMinute, closeMinute })),
  });
}

export const customer = (n = 1) => ({ name: `Guest ${n}`, email: `guest${n}@example.com`, phone: "0917 000 0000" });

export const STAFF_PASSWORD = "correct-horse-battery";

/** A staff account created the way /admin/team creates them. */
export async function createStaffUser(email: string, role: "ADMIN" | "STAFF", options: { disabled?: boolean } = {}) {
  const { createTeamMember } = await import("@/server/data/team");
  const id = await createTeamMember({ name: email.split("@")[0]!, email, role, password: STAFF_PASSWORD });
  if (options.disabled) await db.user.update({ where: { id }, data: { disabledAt: new Date() } });
  return id;
}

/** Signs in through Better Auth and returns request headers carrying the session cookie. */
export async function signedInHeaders(email: string): Promise<Headers> {
  const { getAuth } = await import("@/server/auth");
  const response = await getAuth().api.signInEmail({ body: { email, password: STAFF_PASSWORD }, asResponse: true });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error(`Sign-in failed for ${email} (${response.status})`);
  return new Headers({ cookie });
}
