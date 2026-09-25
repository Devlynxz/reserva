// Build-time branding and the defaults a new client's Settings row is seeded from.
//
// Precedence: the Settings row in the database is the runtime source of truth and is
// editable by an ADMIN. This file covers what must exist before there's a database
// (metadata fallbacks, the seed) and things that are code-level decisions.
// New client = edit this file + env + `SEED_PRESET=… npm run db:seed`.

export type SeedPreset = "resort" | "court" | "salon";

export const reservaConfig = {
  brand: {
    name: "Reserva",
    tagline: "Booked, paid, confirmed.",
    description: "See real availability, pay a deposit, and get your booking confirmed on the spot.",
    /** Default brand color; Settings.brandColor overrides it at runtime. */
    color: "#0e7c86",
  },
  locale: "en-PH",
  /** Seeded into Settings on first run. */
  defaults: {
    currency: "PHP",
    timezone: "Asia/Manila",
    depositPercent: 50,
    holdMinutes: 15,
    weekendDays: [0, 6],
    leadTimeMin: 60,
    maxAdvanceDays: 180,
  },
} as const;
