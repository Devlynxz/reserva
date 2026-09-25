import { describeSchedule } from "./display";
import { formatMoney, money } from "./money";

// Plain-language lines for an offering card. Pure, shared by the landing page and the
// booking flow so a package is described the same way everywhere.

type CopyOffering = {
  mode: "WINDOW" | "SLOT";
  startMinute: number | null;
  endMinute: number | null;
  endsNextDay: boolean;
  durationMin: number | null;
  basePrice: string;
  weekendPrice: string | null;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: string;
  resources: Array<{ name: string; type: "SPACE" | "STAFF" }>;
};

/** "At Main Pool Villa or Kubo Cottage" / "With Ana, Bea or Carlo". */
export function wherePhrase(resources: CopyOffering["resources"], locale: string): string {
  if (resources.length === 0) return "";
  const names = new Intl.ListFormat(locale, { type: "disjunction" }).format(resources.map((r) => r.name));
  return resources.every((r) => r.type === "STAFF") ? `With ${names}` : `At ${names}`;
}

/** "Up to 25 guests. ₱250 per guest above 10." — empty for single-person services. */
export function guestsPhrase(offering: CopyOffering, currency: string, locale: string): string {
  if (offering.maxGuests <= 1) return "";
  const upTo = `Up to ${offering.maxGuests} guests.`;
  const hasFee = money(offering.extraGuestFee).gt(0) && offering.maxGuests > offering.includedGuests;
  return hasFee
    ? `${upTo} ${formatMoney(offering.extraGuestFee, currency, locale, { wholeUnits: true })} per guest above ${offering.includedGuests}.`
    : upTo;
}

export type OfferingCopy = { schedule: string; price: string; weekendPrice: string | null; where: string; guests: string };

export function offeringCopy(offering: CopyOffering, currency: string, locale: string): OfferingCopy {
  const weekend =
    offering.weekendPrice !== null && !money(offering.weekendPrice).eq(money(offering.basePrice))
      ? formatMoney(offering.weekendPrice, currency, locale, { wholeUnits: true })
      : null;
  return {
    schedule: describeSchedule(offering, locale),
    price: formatMoney(offering.basePrice, currency, locale, { wholeUnits: true }),
    weekendPrice: weekend,
    where: wherePhrase(offering.resources, locale),
    guests: guestsPhrase(offering, currency, locale),
  };
}
