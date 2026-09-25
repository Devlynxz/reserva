import type { LocalDate } from "@/lib/dates";

// Declarative shape of a seed preset. Keys (not ids) connect the pieces; the seed
// runner turns them into rows and slugs.

export type SeedResource = {
  key: string;
  name: string;
  type: "SPACE" | "STAFF";
  description: string;
  capacity?: number;
};

type SeedOfferingBase = {
  key: string;
  name: string;
  description: string;
  resourceKeys: string[];
  bufferMin: number;
  basePrice: string;
  weekendPrice?: string;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee?: string;
};

export type SeedOffering =
  | (SeedOfferingBase & { mode: "WINDOW"; start: string; end: string })
  | (SeedOfferingBase & { mode: "SLOT"; durationMin: number; slotStepMin: number });

export type SeedHours = { resourceKey: string | null; weekdays: number[]; open: string; close: string };

export type SeedOverride = {
  label: string;
  startDate: LocalDate;
  endDate: LocalDate;
  multiplier?: string;
  fixedPrice?: string;
  offeringKey?: string;
  resourceKey?: string;
};

export type SeedBlock = { resourceKey: string | null; dayOffset: number; reason: string };

export type SeedPresetDefinition = {
  settings: {
    businessName: string;
    tagline: string;
    brandColor: string;
    currency: string;
    timezone: string;
    depositPercent: string;
    holdMinutes: number;
    weekendDays: number[];
    leadTimeMin: number;
    maxAdvanceDays: number;
    contactEmail: string;
    contactPhone: string;
    address: string;
    policies: string;
    content: {
      hero: { headline: string; subhead: string };
      amenities: string[];
      faq: Array<{ question: string; answer: string }>;
    };
  };
  resources: SeedResource[];
  offerings: SeedOffering[];
  hours: SeedHours[];
  /** Built from "today" so the demo always has a current season. */
  overrides: (today: LocalDate) => SeedOverride[];
  blocks: SeedBlock[];
  users: { admin: { name: string; email: string }; staff: { name: string; email: string } };
  customers: string[];
};
