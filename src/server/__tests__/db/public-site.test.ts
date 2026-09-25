import { NextRequest } from "next/server";
import { beforeEach, expect, it } from "vitest";
import { GET as availabilityRoute } from "@/app/api/availability/route";
import { addMinutes } from "@/lib/dates";
import { createBooking, previewBooking } from "@/server/data/bookings";
import { bookingMatchesEmail, findCustomerBooking, listPublicOfferings } from "@/server/data/public";
import { RATE_LIMITS } from "@/server/rate-limit";
import {
  NOW,
  createResource,
  createSlotOffering,
  createWindowOffering,
  customer,
  db,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
} from "@/test/db";

describeDb("public site data", () => {
  let villaId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings({ weekendDays: [5, 6] });
    villaId = (await createResource({ name: "Villa" })).id;
    await createWindowOffering({ resourceIds: [villaId], startMinute: 19 * 60, endMinute: 7 * 60, slug: "overnight", basePrice: "12000" });
  });

  const request = { offering: { slug: "overnight" }, resourceId: "any", date: "2030-04-05", guestCount: 4, source: "ONLINE" as const };

  it("the review-step preview prices exactly what create charges", async () => {
    const preview = await previewBooking(request, { now: NOW });
    const booking = await createBooking({ ...request, customer: customer() }, { now: NOW });
    expect(preview.price.total).toBe(booking.totalAmount);
    expect(preview.price.deposit).toBe(booking.depositAmount);
    expect(preview.startAt).toEqual(booking.startAt);
    // Previewing reserves nothing.
    expect(await db.booking.count()).toBe(1);
  });

  it("the customer view hides internal notes and flags a lapsed hold", async () => {
    const booking = await createBooking({ ...request, customer: customer(), internalNotes: "VIP — comp the corkage" }, { now: NOW });
    const found = await findCustomerBooking(booking.referenceCode, NOW);
    expect(JSON.stringify(found!.view)).not.toContain("VIP");
    expect(found!.view).toMatchObject({ status: "PENDING_PAYMENT", holdPassed: false, offeringName: "overnight", resourceName: "Villa" });
    expect((await findCustomerBooking(booking.referenceCode, addMinutes(NOW, 16)))!.view.holdPassed).toBe(true);
    expect(await findCustomerBooking("RSV-ZZZZZ")).toBeNull();
  });

  it("lookup matches the booking email case-insensitively, and nothing else", async () => {
    const booking = await createBooking({ ...request, customer: { name: "Maria", email: "maria@example.com" } }, { now: NOW });
    expect(await bookingMatchesEmail(booking.referenceCode, "Maria@Example.COM")).toBe(true);
    expect(await bookingMatchesEmail(booking.referenceCode, "someone@example.com")).toBe(false);
    expect(await bookingMatchesEmail("RSV-ZZZZZ", "maria@example.com")).toBe(false);
  });

  it("lists only active offerings that have an active resource", async () => {
    await createSlotOffering({ resourceIds: [], durationMin: 60, slug: "orphan" });
    await createWindowOffering({ resourceIds: [villaId], startMinute: 8 * 60, endMinute: 17 * 60, slug: "retired" });
    await db.offering.update({ where: { slug: "retired" }, data: { isActive: false } });
    expect((await listPublicOfferings()).map((o) => o.slug)).toEqual(["overnight"]);
  });
});

describeDb("GET /api/availability", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings({ maxAdvanceDays: 36_500 }); // relative to the real clock: keep 2030 in range
    const court = await createResource({ name: "Court" });
    await openEveryDay(9 * 60, 11 * 60);
    await createSlotOffering({ resourceIds: [court.id], durationMin: 60, slug: "court" });
    await createBooking({
      offering: { slug: "court" },
      resourceId: court.id,
      date: "2030-04-06",
      startMinute: 9 * 60,
      guestCount: 2,
      customer: { name: "Maria Santos", email: "maria@example.com" },
      source: "WALK_IN",
    });
  });

  const call = (query: string, ip = "198.51.100.1") =>
    availabilityRoute(new NextRequest(`http://localhost/api/availability?${query}`, { headers: { "x-real-ip": ip } }));

  it("returns free options with only resourceId, startAt, endAt", async () => {
    const response = await call("offering=court&from=2030-04-06&to=2030-04-06");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(text).not.toMatch(/Maria|maria@|RSV-|WALK_IN/);
    const body = JSON.parse(text) as { mode: string; options: Array<Record<string, string>> };
    expect(body.mode).toBe("SLOT");
    expect(body.options).toHaveLength(1); // 09:00 is taken, 10:00 is free
    expect(Object.keys(body.options[0]!).sort()).toEqual(["endAt", "resourceId", "startAt"]);
  });

  it("rejects bad queries and unknown packages", async () => {
    expect((await call("offering=court&from=2030-04-06")).status).toBe(400);
    expect((await call("offering=court&from=2030-04-06&to=2030-12-31")).status).toBe(400);
    expect((await call("offering=court&from=2030-04-06&to=2030-04-06&extra=1")).status).toBe(400);
    expect((await call("offering=nope&from=2030-04-06&to=2030-04-06")).status).toBe(404);
  });

  it("rate-limits per client IP", async () => {
    // This IP has already used its whole window.
    await db.rateLimit.create({ data: { key: "availability:203.0.113.9", count: RATE_LIMITS.availability.limit, windowStart: new Date() } });
    const limited = await call("offering=court&from=2030-04-06&to=2030-04-06", "203.0.113.9");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await call("offering=court&from=2030-04-06&to=2030-04-06", "203.0.113.10")).status).toBe(200);
  });
});
