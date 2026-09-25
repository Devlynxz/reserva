import "server-only";

// Demo deployments (DEMO_MODE=true): a banner on every page and one-click sign-in as the
// seeded owner or staff member. NEVER enable on a real client's site — anyone could
// sign in as the owner.

export function isDemo(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Passwords the seed gave the demo accounts (same defaults as prisma/seed.ts). */
export function demoPassword(role: "ADMIN" | "STAFF"): string {
  return role === "ADMIN"
    ? process.env.SEED_ADMIN_PASSWORD || "reserva-admin-demo"
    : process.env.SEED_STAFF_PASSWORD || "reserva-staff-demo";
}

export const DEMO_LOCKED = "This is disabled in the demo so the site stays usable for everyone.";
