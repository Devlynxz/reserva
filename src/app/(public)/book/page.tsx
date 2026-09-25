import type { Metadata } from "next";
import { BookingFlow } from "@/components/booking/booking-flow";
import type { FlowOffering, FlowSelection } from "@/components/booking/types";
import { addDays, isValidLocalDate, localDateOf } from "@/lib/dates";
import { offeringCopy } from "@/lib/offering-copy";
import { listPublicOfferings } from "@/server/data/public";
import { getSettings } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

export const metadata: Metadata = {
  title: "Book",
  description: "See open dates and times, then book and pay your deposit online.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function BookPage({ searchParams }: { searchParams: SearchParams }) {
  const [settings, offerings, params] = await Promise.all([getSettings(), listPublicOfferings(), searchParams]);
  const locale = reservaConfig.locale;
  const today = localDateOf(new Date(), settings.timezone);

  const flowOfferings: FlowOffering[] = offerings.map((o) => {
    const copy = offeringCopy(o, settings.currency, locale);
    return {
      slug: o.slug,
      name: o.name,
      description: o.description,
      mode: o.mode,
      schedule: copy.schedule,
      price: copy.price,
      weekendPrice: copy.weekendPrice,
      guests: copy.guests,
      includedGuests: o.includedGuests,
      maxGuests: o.maxGuests,
      resources: o.resources.map((r) => ({ id: r.id, name: r.name, type: r.type, description: r.description })),
    };
  });

  // Preselect from the URL (a "Book" link, a refresh, a shared link) — only values that exist.
  const offering = flowOfferings.find((o) => o.slug === one(params.offering)) ?? (flowOfferings.length === 1 ? flowOfferings[0]! : null);
  const resourceParam = one(params.resource);
  const resource =
    offering?.resources.find((r) => r.id === resourceParam)?.id ?? (offering?.resources.length === 1 ? offering.resources[0]!.id : "any");
  const guests = Number(one(params.guests));
  const date = one(params.date);
  const time = one(params.time);
  const initial: FlowSelection = {
    offering: offering?.slug ?? null,
    resource,
    guests: offering
      ? Math.min(offering.maxGuests, Math.max(1, Number.isInteger(guests) && guests > 0 ? guests : offering.includedGuests))
      : 1,
    date: date && isValidLocalDate(date) && date >= today ? date : null,
    time: time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null,
  };

  return (
    <BookingFlow
      offerings={flowOfferings}
      initial={initial}
      settings={{
        businessName: settings.businessName,
        timeZone: settings.timezone,
        locale,
        today,
        lastBookableDate: addDays(today, settings.maxAdvanceDays),
        holdMinutes: settings.holdMinutes,
        policies: settings.policies,
      }}
    />
  );
}
