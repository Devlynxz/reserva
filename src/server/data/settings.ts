import "server-only";
import { z } from "zod";
import { db } from "./db";
import { SettingsMissingError } from "./errors";

// Landing-page copy stored as JSON on Settings. Parsed leniently: a malformed field
// falls back to empty rather than breaking the home page.
const contentSchema = z.object({
  hero: z.object({ headline: z.string(), subhead: z.string() }).optional().catch(undefined),
  amenities: z.array(z.string()).catch([]).default([]),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).catch([]).default([]),
});
export type SiteContent = z.infer<typeof contentSchema>;

/** Business configuration, with money as strings (feed them to lib/money). */
export type BusinessSettings = {
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  brandColor: string;
  currency: string;
  timezone: string;
  depositPercent: string;
  holdMinutes: number;
  weekendDays: number[];
  leadTimeMin: number;
  maxAdvanceDays: number;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  mapUrl: string | null;
  policies: string | null;
  content: SiteContent;
};

export async function getSettings(): Promise<BusinessSettings> {
  const row = await db.settings.findUnique({ where: { id: 1 } });
  if (!row) throw new SettingsMissingError();
  return {
    businessName: row.businessName,
    tagline: row.tagline,
    logoUrl: row.logoUrl,
    brandColor: row.brandColor,
    currency: row.currency,
    timezone: row.timezone,
    depositPercent: row.depositPercent.toString(),
    holdMinutes: row.holdMinutes,
    weekendDays: row.weekendDays,
    leadTimeMin: row.leadTimeMin,
    maxAdvanceDays: row.maxAdvanceDays,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    address: row.address,
    mapUrl: row.mapUrl,
    policies: row.policies,
    content: contentSchema.catch({ amenities: [], faq: [] }).parse(row.content),
  };
}

/** For chrome that must render even before the database is set up (layout, metadata). */
export async function getSettingsOrNull(): Promise<BusinessSettings | null> {
  try {
    return await getSettings();
  } catch (error) {
    console.error("Settings unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

export type SettingsUpdate = {
  businessName: string;
  tagline?: string;
  brandColor: string;
  currency: string;
  timezone: string;
  depositPercent: string;
  holdMinutes: number;
  weekendDays: number[];
  leadTimeMin: number;
  maxAdvanceDays: number;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  mapUrl?: string;
  policies?: string;
  content: SiteContent;
};

export async function updateSettings(input: SettingsUpdate): Promise<void> {
  const data = {
    ...input,
    tagline: input.tagline ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    address: input.address ?? null,
    mapUrl: input.mapUrl ?? null,
    policies: input.policies ?? null,
    content: input.content,
  };
  await db.settings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
}
