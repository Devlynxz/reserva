import Link from "next/link";
import { headers } from "next/headers";
import { buttonStyles } from "@/components/ui";
import { type LocalDate, addDays, localDateOf } from "@/lib/dates";
import { formatClock, formatShortDate } from "@/lib/display";
import { offeringCopy } from "@/lib/offering-copy";
import { getPublicAvailability } from "@/server/data/availability";
import { type PublicOffering, listPublicOfferings } from "@/server/data/public";
import { type BusinessSettings, getSettingsOrNull } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

const LOCALE = reservaConfig.locale;

type NextOpening = { offering: PublicOffering; startAt: Date } | { offering: PublicOffering; startAt: null };

/** Earliest bookable start per offering within the next few weeks: real availability, up front. */
async function nextOpenings(offerings: PublicOffering[], settings: BusinessSettings): Promise<NextOpening[]> {
  const today: LocalDate = localDateOf(new Date(), settings.timezone);
  const to = addDays(today, Math.min(settings.maxAdvanceDays, 30));
  return Promise.all(
    offerings.map(async (offering) => {
      const availability = await getPublicAvailability({ offeringSlug: offering.slug, from: today, to });
      const first = availability?.options.reduce<Date | null>((min, o) => (!min || o.startAt < min ? o.startAt : min), null);
      return { offering, startAt: first ?? null };
    }),
  );
}

export default async function HomePage() {
  const settings = await getSettingsOrNull();
  if (!settings) return <SetupNeeded />;

  const offerings = await listPublicOfferings();
  const openings = await nextOpenings(offerings, settings);
  const { content, timezone: tz, currency } = settings;
  const headline = content.hero?.headline ?? settings.tagline ?? settings.businessName;
  const subhead = content.hero?.subhead ?? reservaConfig.brand.description;
  const isServices = offerings.length > 0 && offerings.every((o) => o.mode === "SLOT");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <main>
      <JsonLd settings={settings} nonce={nonce} />

      {/* Hero: what this place is, and when you can actually get in. */}
      <section className="mx-auto grid max-w-5xl gap-10 px-4 pt-10 pb-14 sm:px-6 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-14">
        <div className="space-y-6">
          <p className="text-sm font-semibold text-brand-ink">{settings.businessName}</p>
          <h1 className="text-[2.35rem] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-6xl">{headline}</h1>
          <p className="max-w-prose text-lg leading-relaxed text-ink-muted">{subhead}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className={buttonStyles({ size: "lg" })}>
              Book now
            </Link>
            <a href="#offerings" className={buttonStyles({ variant: "secondary", size: "lg" })}>
              {isServices ? "See services" : "See packages"}
            </a>
          </div>
        </div>

        {openings.length > 0 && (
          <div className="rounded-card border border-line bg-surface shadow-card">
            <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold text-ink-muted">Next openings</h2>
            <ul className="divide-y divide-line">
              {openings.map(({ offering, startAt }) => (
                <li key={offering.slug}>
                  <Link
                    href={`/book?offering=${offering.slug}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{offering.name}</span>
                      <span className="block text-sm text-ink-muted tabular-nums">
                        {startAt ? `${formatShortDate(startAt, tz, LOCALE)}, ${formatClock(startAt, tz, LOCALE)}` : "Fully booked for now"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-brand-ink">Book</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Offerings */}
      <section id="offerings" aria-labelledby="offerings-title" className="scroll-mt-20 border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 id="offerings-title" className="text-2xl font-extrabold sm:text-3xl">
            {isServices ? "Services" : "Packages"}
          </h2>
          {offerings.length === 0 ? (
            <p className="mt-4 text-ink-muted">Nothing is open for booking right now. Contact us and we&apos;ll help you directly.</p>
          ) : (
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {offerings.map((offering) => {
                const copy = offeringCopy(offering, currency, LOCALE);
                return (
                  <li key={offering.slug} className="grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-8">
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="text-lg font-bold">{offering.name}</h3>
                      <p className="font-medium text-ink tabular-nums">{copy.schedule}</p>
                      {offering.description && <p className="text-ink-muted">{offering.description}</p>}
                      <p className="text-sm text-ink-muted">
                        {[copy.where, copy.guests].filter(Boolean).join(". ")}
                        {copy.where && !copy.guests ? "." : ""}
                      </p>
                    </div>
                    <div className="flex items-end justify-between gap-4 sm:flex-col sm:items-end">
                      <p className="sm:text-right">
                        <span className="block text-xl font-extrabold tabular-nums">{copy.price}</span>
                        {copy.weekendPrice && (
                          <span className="block text-sm text-ink-muted tabular-nums">Weekends {copy.weekendPrice}</span>
                        )}
                      </p>
                      <Link
                        href={`/book?offering=${offering.slug}`}
                        className={buttonStyles({ variant: "secondary" })}
                        aria-label={`Book ${offering.name}`}
                      >
                        Book
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-14 px-4 py-14 sm:px-6 lg:grid-cols-2">
        {content.amenities.length > 0 && (
          <section aria-labelledby="amenities-title">
            <h2 id="amenities-title" className="text-2xl font-extrabold">
              What&apos;s included
            </h2>
            <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {content.amenities.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <svg viewBox="0 0 16 16" className="mt-1 size-4 shrink-0 text-brand" fill="none" aria-hidden="true">
                    <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="visit-title">
          <h2 id="visit-title" className="text-2xl font-extrabold">
            Find us
          </h2>
          <dl className="mt-6 space-y-4">
            {settings.address && (
              <div>
                <dt className="text-sm font-semibold text-ink-muted">Address</dt>
                <dd className="mt-1">
                  {settings.address}
                  <br />
                  <a
                    href={settings.mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}`}
                    className="font-semibold text-brand-ink underline underline-offset-4"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open in Google Maps
                  </a>
                </dd>
              </div>
            )}
            {settings.contactPhone && (
              <div>
                <dt className="text-sm font-semibold text-ink-muted">Phone</dt>
                <dd className="mt-1">
                  <a href={`tel:${settings.contactPhone.replace(/[^\d+]/g, "")}`} className="font-semibold underline underline-offset-4">
                    {settings.contactPhone}
                  </a>
                </dd>
              </div>
            )}
            {settings.contactEmail && (
              <div>
                <dt className="text-sm font-semibold text-ink-muted">Email</dt>
                <dd className="mt-1">
                  <a href={`mailto:${settings.contactEmail}`} className="font-semibold underline underline-offset-4">
                    {settings.contactEmail}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </div>

      {content.faq.length > 0 && (
        <section aria-labelledby="faq-title" className="border-t border-line">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
            <h2 id="faq-title" className="text-2xl font-extrabold">
              Questions
            </h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {content.faq.map(({ question, answer }) => (
                <details key={question} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {question}
                    <svg viewBox="0 0 16 16" className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-45" aria-hidden="true">
                      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <p className="mt-3 text-ink-muted">{answer}</p>
                </details>
              ))}
            </div>
            {settings.policies && (
              <p className="mt-8 text-sm leading-relaxed text-ink-muted">
                <span className="font-semibold text-ink">Booking policy. </span>
                {settings.policies}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Mobile: keep the main action in reach. The footer leaves room for it (data-action-bar). */}
      <div data-action-bar="mobile" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 p-3 backdrop-blur sm:hidden">
        <Link href="/book" className={buttonStyles({ size: "lg", className: "w-full" })}>
          Book now
        </Link>
      </div>
    </main>
  );
}

function JsonLd({ settings, nonce }: { settings: BusinessSettings; nonce?: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: settings.businessName,
    description: settings.tagline ?? undefined,
    url: process.env.NEXT_PUBLIC_APP_URL,
    telephone: settings.contactPhone ?? undefined,
    email: settings.contactEmail ?? undefined,
    address: settings.address ?? undefined,
    currenciesAccepted: settings.currency,
  };
  // "<" is escaped so admin-entered text can never close the script element.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: json }} />;
}

function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-3 px-4">
      <h1 className="text-2xl font-bold">This site isn&apos;t set up yet</h1>
      <p className="text-ink-muted">
        The business settings are missing. If you run this site, apply the migrations and run the seed, then reload.
      </p>
    </main>
  );
}
