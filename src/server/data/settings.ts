import "server-only";
import { db } from "./db";
import { SettingsMissingError } from "./errors";

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
  };
}
