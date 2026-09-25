import { describe, expect, it } from "vitest";
import { ADMIN_AREAS, canAccess, isRole } from "../permissions";

describe("canAccess", () => {
  it("lets ADMIN into every area", () => {
    for (const area of ADMIN_AREAS) expect(canAccess("ADMIN", area)).toBe(true);
  });

  it("keeps STAFF out of settings, team and reports only", () => {
    const denied = ADMIN_AREAS.filter((area) => !canAccess("STAFF", area));
    expect(denied).toEqual(["settings", "team", "reports"]);
  });
});

describe("isRole", () => {
  it("accepts only the two roles", () => {
    expect(isRole("ADMIN")).toBe(true);
    expect(isRole("STAFF")).toBe(true);
    expect(isRole("admin")).toBe(false);
    expect(isRole("OWNER")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
