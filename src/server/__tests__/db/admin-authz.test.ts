import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as exportRoute } from "@/app/api/admin/reports/export/route";
import { ADMIN_AREAS } from "@/lib/permissions";
import { createBooking } from "@/server/data/bookings";
import { AuthorizationError, assertArea } from "@/server/session";
import {
  NOW,
  createResource,
  createSlotOffering,
  createStaffUser,
  db,
  describeDb,
  openEveryDay,
  resetDb,
  seedSettings,
  signedInHeaders,
} from "@/test/db";

const OWNER_ONLY = ["settings", "team", "reports"] as const;

describeDb("admin authorization (real sessions)", () => {
  let owner: Headers;
  let staff: Headers;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    await createStaffUser("owner@example.com", "ADMIN");
    await createStaffUser("staff@example.com", "STAFF");
    owner = await signedInHeaders("owner@example.com");
    staff = await signedInHeaders("staff@example.com");
  });

  it("lets owners into every area", async () => {
    for (const area of ADMIN_AREAS) await expect(assertArea(area, owner)).resolves.toMatchObject({ role: "ADMIN" });
  });

  it("keeps STAFF out of settings, team and reports — and only those", async () => {
    for (const area of ADMIN_AREAS) {
      const check = assertArea(area, staff);
      if ((OWNER_ONLY as readonly string[]).includes(area)) {
        await expect(check).rejects.toSatisfy((e) => e instanceof AuthorizationError && e.reason === "forbidden");
      } else {
        await expect(check).resolves.toMatchObject({ role: "STAFF" });
      }
    }
  });

  it("refuses signed-out requests and forged cookies", async () => {
    await expect(assertArea("dashboard", new Headers())).rejects.toMatchObject({ reason: "signed_out" });
    await expect(assertArea("dashboard", new Headers({ cookie: "better-auth.session_token=forged.value" }))).rejects.toMatchObject({
      reason: "signed_out",
    });
  });

  it("locks out someone disabled after they signed in, immediately", async () => {
    await db.user.update({ where: { email: "staff@example.com" }, data: { disabledAt: new Date() } });
    await expect(assertArea("bookings", staff)).rejects.toMatchObject({ reason: "signed_out" });
  });

  it("applies a role change on the very next request", async () => {
    await db.user.update({ where: { email: "staff@example.com" }, data: { role: "ADMIN" } });
    await expect(assertArea("settings", staff)).resolves.toMatchObject({ role: "ADMIN" });
  });

  describe("GET /api/admin/reports/export", () => {
    const call = (headers: Headers, month = "2030-04") =>
      exportRoute(new NextRequest(`http://localhost/api/admin/reports/export?month=${month}`, { headers }));

    it("401 signed out, 403 for STAFF", async () => {
      expect((await call(new Headers())).status).toBe(401);
      expect((await call(staff)).status).toBe(403);
    });

    it("gives owners a formula-safe CSV of the month's bookings", async () => {
      const court = await createResource({ name: "Court 1" });
      await openEveryDay();
      await createSlotOffering({ resourceIds: [court.id], durationMin: 60, slug: "court" });
      await createBooking(
        {
          offering: { slug: "court" },
          resourceId: court.id,
          date: "2030-04-06",
          startMinute: 600,
          guestCount: 2,
          customer: { name: '=HYPERLINK("http://evil.example","Click")', email: "x@example.com" },
          source: "WALK_IN",
        },
        { now: NOW },
      );

      const response = await call(owner);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe('attachment; filename="bookings-2030-04.csv"');
      const csv = await response.text();
      const [header, row] = csv.replace(/^﻿/, "").split("\r\n");
      expect(header).toMatch(/^Reference,Status,Source,Package/);
      expect(row).toContain(`"'=HYPERLINK(""http://evil.example"",""Click"")"`);
      expect(row).not.toMatch(/,=HYPERLINK/);
    });

    it("rejects a malformed month", async () => {
      expect((await call(owner, "2030-13")).status).toBe(400);
    });
  });
});
