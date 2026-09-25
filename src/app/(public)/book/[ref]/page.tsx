import type { Metadata } from "next";
import Link from "next/link";
import { Badge, type BadgeTone, buttonStyles } from "@/components/ui";
import { formatClock, formatRange } from "@/lib/display";
import { formatMoney, money } from "@/lib/money";
import { normalizeReferenceCode } from "@/lib/reference-code";
import { type CustomerBookingView, findCustomerBooking } from "@/server/data/public";
import { type BusinessSettings, getSettings } from "@/server/data/settings";
import { canViewBooking } from "@/server/booking-access";
import { env } from "@/server/env";
import { reservaConfig } from "@reserva/config";
import { HoldCountdown } from "./hold-countdown";
import { PayDepositButton } from "./pay-deposit-button";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const LOCALE = reservaConfig.locale;

type Props = { params: Promise<{ ref: string }>; searchParams: Promise<{ t?: string | string[]; paid?: string | string[] }> };

/**
 * A customer's booking. Opens with the unguessable link token (?t=) or the signed cookie
 * /lookup sets. Unknown references and wrong tokens get the SAME page, so it can't be
 * used to check whether a reference exists.
 */
export default async function CustomerBookingPage({ params, searchParams }: Props) {
  const [{ ref }, { t, paid }] = await Promise.all([params, searchParams]);
  const reference = normalizeReferenceCode(decodeURIComponent(ref));
  const found = reference ? await findCustomerBooking(reference) : null;
  const token = typeof t === "string" ? t : undefined;

  if (!reference || !found || !(await canViewBooking(reference, found.accessTokenHash, token))) return <NoAccess />;

  const settings = await getSettings();
  return (
    <Ticket
      booking={found.view}
      settings={settings}
      paymentsEnabled={env().PAYMENT_PROVIDER !== "none"}
      token={token}
      returnedFromCheckout={paid === "1"}
    />
  );
}

function NoAccess() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-extrabold">We can&apos;t show this booking</h1>
      <p className="text-ink-muted">
        The link may be incomplete or expired. Look your booking up with its reference and the email you booked with.
      </p>
      <Link href="/lookup" className={buttonStyles({ className: "self-start" })}>
        Find my booking
      </Link>
    </main>
  );
}

type StatusCopy = { tone: BadgeTone; badge: string; title: string };

function statusCopy(booking: CustomerBookingView, holdPassed: boolean): StatusCopy {
  switch (booking.status) {
    case "PENDING_PAYMENT":
      return holdPassed
        ? { tone: "neutral", badge: "Hold expired", title: "This hold ran out" }
        : { tone: "warning", badge: "Awaiting payment", title: "Almost there" };
    case "CONFIRMED":
      return { tone: "success", badge: "Confirmed", title: "You're booked" };
    case "EXPIRED":
      return { tone: "neutral", badge: "Hold expired", title: "This hold ran out" };
    case "CANCELLED":
      return { tone: "danger", badge: "Cancelled", title: "This booking was cancelled" };
    case "COMPLETED":
      return { tone: "info", badge: "Completed", title: "Thanks for visiting" };
    case "NO_SHOW":
      return { tone: "neutral", badge: "No-show", title: "Marked as a no-show" };
  }
}

function Ticket({
  booking,
  settings,
  paymentsEnabled,
  token,
  returnedFromCheckout,
}: {
  booking: CustomerBookingView;
  settings: BusinessSettings;
  paymentsEnabled: boolean;
  token: string | undefined;
  returnedFromCheckout: boolean;
}) {
  const tz = settings.timezone;
  const fmt = (amount: string) => formatMoney(amount, booking.currency, LOCALE);
  const { holdPassed } = booking;
  const copy = statusCopy(booking, holdPassed);
  const pending = booking.status === "PENDING_PAYMENT" && !holdPassed;
  const balance = money(booking.totalAmount).minus(money(booking.amountPaid));
  const who = booking.resourceType === "STAFF" ? "With" : "Place";
  const contact = [settings.contactPhone, settings.contactEmail].filter(Boolean).join(" or ");

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6 sm:py-12">
      <article className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-labelledby="ticket-title">
        <header className="space-y-3 p-5 sm:p-7">
          <Badge tone={copy.tone} dot>
            {copy.badge}
          </Badge>
          <h1 id="ticket-title" className="text-3xl font-extrabold tracking-tight">
            {copy.title}
          </h1>
          <StatusMessage booking={booking} settings={settings} pending={pending} holdPassed={holdPassed} contact={contact} fmt={fmt} />
        </header>

        {/* The stub: perforated edge with notches, then the reference to quote at the front desk. */}
        <div className="relative" aria-hidden="true">
          <div className="border-t-2 border-dashed border-line-strong" />
          <span className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full border border-line bg-bg" />
          <span className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full border border-line bg-bg" />
        </div>

        <div className="space-y-6 p-5 sm:p-7">
          <div>
            <p className="text-sm text-ink-muted">Reference</p>
            <p className="text-3xl font-extrabold tracking-[0.08em] tabular-nums sm:text-4xl">{booking.referenceCode}</p>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Package" value={booking.offeringName} />
            <Detail label={who} value={booking.resourceName} />
            <Detail label="When" value={formatRange(booking.startAt, booking.endAt, tz, LOCALE)} wide />
            {booking.guestCount > 1 && <Detail label="Guests" value={String(booking.guestCount)} />}
            <Detail label="Booked by" value={`${booking.customerName}, ${booking.customerEmail}`} wide />
            {booking.customerNotes && <Detail label="Your notes" value={booking.customerNotes} wide />}
          </dl>

          <dl className="space-y-2 border-t border-line pt-5 text-sm">
            <Row label="Total" value={fmt(booking.totalAmount)} strong />
            <Row label="Paid" value={fmt(booking.amountPaid)} />
            {balance.gt(0) && booking.status !== "CANCELLED" && booking.status !== "EXPIRED" && (
              <Row label={pending ? "Deposit due now" : "Balance due on the day"} value={pending ? fmt(booking.depositAmount) : formatMoney(balance, booking.currency, LOCALE)} />
            )}
          </dl>

          {pending && returnedFromCheckout && (
            <p role="status" className="rounded-control bg-info-soft px-4 py-3 text-sm font-medium text-info">
              Thanks! We&apos;re confirming your payment with the provider. This page updates by itself.
            </p>
          )}
          {pending && (
            <div className="space-y-2">
              {paymentsEnabled && (
                <PayDepositButton reference={booking.referenceCode} token={token} label={`Pay ${fmt(booking.depositAmount)} deposit`} />
              )}
              {!paymentsEnabled && (
                <p className="text-sm text-ink-muted">
                  Online payment isn&apos;t available yet.{contact ? ` Contact ${settings.businessName} at ${contact} to pay and confirm.` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </article>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Keep this page&apos;s link. You can also find this booking any time with its reference and your email on{" "}
        <Link href="/lookup" className="font-semibold text-ink underline underline-offset-4">
          Find my booking
        </Link>
        .
      </p>
    </main>
  );
}

function StatusMessage({
  booking,
  settings,
  pending,
  holdPassed,
  contact,
  fmt,
}: {
  booking: CustomerBookingView;
  settings: BusinessSettings;
  pending: boolean;
  holdPassed: boolean;
  contact: string;
  fmt: (amount: string) => string;
}) {
  const again = (
    <Link href="/book" className="font-semibold text-brand-ink underline underline-offset-4">
      Book again
    </Link>
  );
  if (pending && booking.holdExpiresAt) {
    return (
      <div className="space-y-1 text-ink-muted">
        <p>
          We&apos;re holding this for you until {formatClock(booking.holdExpiresAt, settings.timezone, LOCALE)}. Pay the{" "}
          {fmt(booking.depositAmount)} deposit to confirm it.
        </p>
        <HoldCountdown expiresAt={booking.holdExpiresAt.toISOString()} />
      </div>
    );
  }
  if (booking.status === "PENDING_PAYMENT") {
    return holdPassed ? (
      <p className="text-ink-muted">The deposit wasn&apos;t paid in time, so the slot was released. {again}</p>
    ) : (
      <p className="text-ink-muted">We&apos;ve noted your booking and will confirm it once payment is recorded.</p>
    );
  }
  switch (booking.status) {
    case "CONFIRMED":
      return <p className="text-ink-muted">Your deposit is in. Show this reference when you arrive.</p>;
    case "EXPIRED":
      return <p className="text-ink-muted">The deposit wasn&apos;t paid in time, so the slot was released. {again}</p>;
    case "CANCELLED":
      return <p className="text-ink-muted">{contact ? `Questions? Contact us at ${contact}.` : "Contact us if you have questions."}</p>;
    default:
      return <p className="text-ink-muted">We hope to see you again. {again}</p>;
  }
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-semibold break-words tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "text-base font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
