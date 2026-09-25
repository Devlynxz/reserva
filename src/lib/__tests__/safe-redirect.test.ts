import { describe, expect, it } from "vitest";
import { safeAdminRedirect } from "../safe-redirect";

describe("safeAdminRedirect", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/bookings", "/admin/bookings"],
    ["/admin/bookings?status=CONFIRMED", "/admin/bookings?status=CONFIRMED"],
  ])("keeps %s", (next, expected) => {
    expect(safeAdminRedirect(next)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example/admin",
    "//evil.example/admin",
    "/\\evil.example",
    "/admin\\..\\..\\evil",
    "/administrator",
    "/admin/../book",
    "/book",
    "javascript:alert(1)",
    "/admin\n/x",
  ])("falls back for %j", (next) => {
    expect(safeAdminRedirect(next)).toBe("/admin");
  });
});
