// Who may use which admin area. Pure so the rule is unit-tested; enforced by
// src/server/session.ts in layouts, pages, server actions and route handlers.

export const ROLES = ["ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const ADMIN_AREAS = [
  "dashboard",
  "calendar",
  "bookings",
  "resources",
  "offerings",
  "hours",
  "pricing",
  "blocked",
  "settings",
  "team",
  "reports",
] as const;
export type AdminArea = (typeof ADMIN_AREAS)[number];

const ADMIN_ONLY: ReadonlySet<AdminArea> = new Set(["settings", "team", "reports"]);

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canAccess(role: Role, area: AdminArea): boolean {
  return role === "ADMIN" || !ADMIN_ONLY.has(area);
}
