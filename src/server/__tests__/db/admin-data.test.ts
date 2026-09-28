import { beforeEach, describe, expect, it } from "vitest";
import { PaymentAmountError, recordManualPayment } from "@/server/data/admin-bookings";
import { CatalogError, addHours, getOffering, saveOffering } from "@/server/data/admin-catalog";
import { createBooking, sweepExpiredHolds } from "@/server/data/bookings";
import { dashboardData, monthBounds, monthReport } from "@/server/data/reports";
import { getSettings, setIconUrl, updateSettings } from "@/server/data/settings";
import { TeamError, createTeamMember, setTeamMemberDisabled, setTeamMemberRole } from "@/server/data/team";
import {
  NOW,
  at,
  createResource,
  createSlotOffering,
  createStaffUser,
  customer,
  db,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
  signedInHeaders,
} from "@/test/db";
import { addMinutes } from "@/lib/dates";

describeDb("admin data", () => {
  let courtId: string;
  let offeringId: string;
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings({ depositPercent: "50" });
    await openEveryDay(9 * 60, 17 * 60);
    courtId = (await createResource({ name: "Court 1" })).id;
    offeringId = (await createSlotOffering({ resourceIds: [courtId], durationMin: 60, basePrice: "1000", slug: "court" })).id;
    ownerId = await createStaffUser("owner@example.com", "ADMIN");
  });

  const book = (hour: number, source: "ONLINE" | "WALK_IN" = "ONLINE", n = hour) =>
    createBooking(
      { offering: { id: offeringId }, resourceId: courtId, date: "2030-04-06", startMinute: hour * 60, guestCount: 2, customer: customer(n), source },
      { now: NOW },
    );

  describe("recordManualPayment", () => {
    it("records cash and confirms a pending booking in one go", async () => {
      const b = await book(10);
      await expect(recordManualPayment({ bookingId: b.id, amount: "500", method: "cash", confirm: true, actorId: ownerId, now: NOW })).resolves.toEqual({
        confirmed: true,
      });
      const row = await db.booking.findUniqueOrThrow({ where: { id: b.id }, include: { payments: true, events: true } });
      expect(row.status).toBe("CONFIRMED");
      expect(row.amountPaid.toString()).toBe("500");
      expect(row.payments[0]).toMatchObject({ provider: "MANUAL", method: "cash", recordedById: ownerId });
      expect(row.events.at(-1)).toMatchObject({ toStatus: "CONFIRMED", actorId: ownerId, note: "Payment recorded (cash)" });
    });

    it("takes a balance payment without touching status, and refuses overpayment", async () => {
      const b = await book(11, "WALK_IN");
      await expect(recordManualPayment({ bookingId: b.id, amount: "600", method: "cash", confirm: true, actorId: ownerId })).resolves.toEqual({
        confirmed: false,
      });
      await expect(recordManualPayment({ bookingId: b.id, amount: "400.01", method: "cash", confirm: false, actorId: ownerId })).rejects.toBeInstanceOf(
        PaymentAmountError,
      );
      await expect(recordManualPayment({ bookingId: b.id, amount: "0", method: "cash", confirm: false, actorId: ownerId })).rejects.toThrow(/above 0/);
      expect((await db.booking.findUniqueOrThrow({ where: { id: b.id } })).amountPaid.toString()).toBe("600");
    });
  });

  describe("dashboard and reports", () => {
    it("counts the month, money collected and what needs attention", async () => {
      const paid = await book(9);
      await recordManualPayment({ bookingId: paid.id, amount: "1000", method: "gcash", confirm: true, actorId: ownerId, now: NOW });
      // Money on a hold that then lapsed: must be surfaced.
      const lapsed = await book(12);
      await db.payment.create({ data: { bookingId: lapsed.id, provider: "PAYMONGO", providerEventId: "evt_x", amount: "500", currency: "PHP", method: "gcash", status: "SUCCEEDED" } });
      await db.booking.update({ where: { id: lapsed.id }, data: { amountPaid: "500" } });
      await sweepExpiredHolds(addMinutes(NOW, 30));
      // "Collected" is cash-basis (when money arrived): date the payments inside April 2030.
      await db.payment.updateMany({ data: { createdAt: at("2030-04-01", "09:00") } });

      const settings = await getSettings();
      const dash = await dashboardData(at("2030-04-06", "08:00"), settings);
      expect(dash.today.map((b) => b.id)).toContain(paid.id);
      expect(dash.attention.map((b) => b.id)).toEqual([lapsed.id]);
      expect(dash.month.month).toBe("2030-04");
      expect(dash.month.collected).toBe("1500.00");

      const report = await monthReport("2030-04", settings);
      expect(report.byStatus).toMatchObject({ CONFIRMED: 1, EXPIRED: 1 });
      expect(report.offerings).toEqual([{ name: "court", count: 1, booked: "1000.00" }]);
      expect(report.collected).toEqual({
        total: "1500.00",
        count: 2,
        byMethod: [{ method: "gcash", count: 2, total: "1500.00" }],
      });
      // One hour booked out of 8 open hours a day × 30 days on one court.
      expect(report.occupancy).toEqual({ bookedMinutes: 60, bookableMinutes: 8 * 60 * 30, rate: 60 / (8 * 60 * 30) });
    });

    it("computes month bounds, including leap years", () => {
      expect(monthBounds("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
      expect(monthBounds("2030-12")).toEqual({ first: "2030-12-01", last: "2030-12-31" });
    });
  });

  describe("team", () => {
    it("refuses duplicate emails", async () => {
      await expect(createTeamMember({ name: "Dup", email: "owner@example.com", role: "STAFF", password: "long-enough-password" })).rejects.toMatchObject({
        field: "email",
      });
    });

    it("disabling signs someone out everywhere; nobody can disable or demote themselves", async () => {
      const staffId = await createStaffUser("staff@example.com", "STAFF");
      await signedInHeaders("staff@example.com");
      expect(await db.session.count({ where: { userId: staffId } })).toBe(1);

      await setTeamMemberDisabled(staffId, true, ownerId);
      expect(await db.session.count({ where: { userId: staffId } })).toBe(0);
      await expect(signedInHeaders("staff@example.com")).rejects.toThrow(/Sign-in failed/);

      await expect(setTeamMemberDisabled(ownerId, true, ownerId)).rejects.toBeInstanceOf(TeamError);
      await expect(setTeamMemberRole(ownerId, "STAFF", ownerId)).rejects.toBeInstanceOf(TeamError);
    });

    it("always keeps one active owner", async () => {
      const second = await createStaffUser("second@example.com", "ADMIN");
      await setTeamMemberDisabled(ownerId, true, second); // fine: `second` is still an owner
      await expect(setTeamMemberRole(second, "STAFF", ownerId)).rejects.toThrow(/at least one active owner/);
    });
  });

  describe("catalog", () => {
    it("refuses overlapping hours on the same schedule and day", async () => {
      await expect(addHours({ resourceId: null, weekday: 1, openMinute: 16 * 60, closeMinute: 18 * 60 })).rejects.toBeInstanceOf(CatalogError);
      await expect(addHours({ resourceId: null, weekday: 1, openMinute: 17 * 60, closeMinute: 19 * 60 })).resolves.toBeDefined(); // touching is fine
      await expect(addHours({ resourceId: courtId, weekday: 1, openMinute: 10 * 60, closeMinute: 12 * 60 })).resolves.toBeDefined(); // other schedule
    });

    it("switches an offering between modes and reassigns its resources", async () => {
      const kubo = await createResource({ name: "Kubo" });
      await saveOffering(
        {
          slug: "court",
          name: "Court",
          mode: "WINDOW",
          startMinute: 19 * 60,
          endMinute: 7 * 60,
          endsNextDay: true,
          bufferMin: 30,
          basePrice: "1200",
          includedGuests: 2,
          maxGuests: 4,
          extraGuestFee: "100",
          isActive: true,
          sortOrder: 0,
          resourceIds: [kubo.id],
        },
        offeringId,
      );
      const saved = await getOffering(offeringId);
      expect(saved).toMatchObject({ mode: "WINDOW", startMinute: 1140, endsNextDay: true, durationMin: null, slotStepMin: null });
      expect(saved?.resources).toEqual([{ id: kubo.id }]);
    });
  });

  it("settings round-trip, including landing content", async () => {
    const current = await getSettings();
    await updateSettings({
      ...current,
      tagline: undefined,
      contactEmail: "hi@example.com",
      contactPhone: undefined,
      address: undefined,
      mapUrl: undefined,
      policies: undefined,
      businessName: "Renamed",
      content: { hero: { headline: "Hello", subhead: "World" }, amenities: ["Pool"], faq: [{ question: "Q?", answer: "A." }] },
    });
    expect(await getSettings()).toMatchObject({
      businessName: "Renamed",
      contactEmail: "hi@example.com",
      tagline: null,
      content: { hero: { headline: "Hello", subhead: "World" }, amenities: ["Pool"], faq: [{ question: "Q?", answer: "A." }] },
    });
  });

  it("stores the app icon and the 'Powered by' switch", async () => {
    expect(await getSettings()).toMatchObject({ iconUrl: null, showPoweredBy: true });

    const icon = "https://abc123.public.blob.vercel-storage.com/icons/icon-1.png";
    await setIconUrl(icon);
    // Optional text comes back as null but is written as undefined; this test doesn't touch it.
    const { tagline: _t, contactEmail: _e, contactPhone: _p, address: _a, mapUrl: _m, policies: _po, ...rest } = await getSettings();
    await updateSettings({ ...rest, showPoweredBy: false });
    expect(await getSettings()).toMatchObject({ iconUrl: icon, showPoweredBy: false });

    await setIconUrl(null);
    expect((await getSettings()).iconUrl).toBeNull();
  });
});
