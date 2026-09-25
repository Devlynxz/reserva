import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, AdminCheckbox, AdminField } from "@/components/admin/action-form";
import { SOURCE_LABEL, STATUS_LABEL, StatusBadge } from "@/components/admin/status-badge";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { nextStatuses } from "@/lib/booking-status";
import { money } from "@/lib/money";
import { idSchema } from "@/lib/validation";
import { changeStatusAction, recordPaymentAction, saveNotesAction } from "@/server/actions/admin/bookings";
import { getBookingDetail } from "@/server/data/admin-bookings";
import { requireArea } from "@/server/session";
import { adminFormat } from "../../_shared/format";

// Dialog-heavy and only needed when staff act on a booking: its own chunk.
const StatusActions = dynamic(() => import("./status-actions").then((m) => m.StatusActions), {
  loading: () => <div className="h-11 w-40 animate-pulse rounded-control bg-surface-muted" />,
});

export const metadata: Metadata = { title: "Booking", robots: { index: false } };

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gcash", label: "GCash (direct)" },
  { value: "maya", label: "Maya (direct)" },
  { value: "card", label: "Card terminal" },
  { value: "other", label: "Other" },
];

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireArea("bookings");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const [booking, f] = await Promise.all([getBookingDetail(id), adminFormat()]);
  if (!booking) notFound();

  const now = new Date();
  const actions = nextStatuses(booking.status, "staff", { now, startAt: booking.startAt });
  const balance = money(booking.totalAmount).minus(money(booking.amountPaid));
  const canTakePayment = balance.gt(0) && booking.status !== "EXPIRED" && booking.status !== "CANCELLED";
  const m = (amount: string) => f.money(amount, booking.currency);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/bookings" className="text-sm font-semibold text-ink-muted hover:text-ink">
          All bookings
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold tracking-wide tabular-nums">{booking.referenceCode}</h1>
          <StatusBadge status={booking.status} />
          <span className="text-sm text-ink-muted">{SOURCE_LABEL[booking.source]}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Booking" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="Package" value={booking.offeringName} />
                <Item label={booking.resourceType === "STAFF" ? "With" : "Place"} value={booking.resourceName} />
                <Item label="When" value={f.range(booking.startAt, booking.endAt)} wide />
                <Item label="Guests" value={String(booking.guestCount)} />
                <Item label="Booked" value={f.when(booking.createdAt)} />
                {booking.status === "PENDING_PAYMENT" && booking.holdExpiresAt && <Item label="Hold ends" value={f.when(booking.holdExpiresAt)} />}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Customer" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label="Name" value={booking.customerName} />
                <Item label="Email" value={booking.customerEmail} href={`mailto:${booking.customerEmail}`} />
                {booking.customerPhone && <Item label="Phone" value={booking.customerPhone} href={`tel:${booking.customerPhone.replace(/[^\d+]/g, "")}`} />}
                {booking.customerNotes && <Item label="Their notes" value={booking.customerNotes} wide />}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            <CardBody className="space-y-5">
              <dl className="space-y-2 text-sm">
                {booking.price.lines.map((line, i) => (
                  <div key={`${line.label}-${i}`} className="flex justify-between gap-4 text-ink-muted">
                    <dt>{line.label}</dt>
                    <dd className="tabular-nums">{m(line.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 border-t border-line pt-2 font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{m(booking.totalAmount)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Deposit</dt>
                  <dd className="tabular-nums">{m(booking.depositAmount)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Paid</dt>
                  <dd className="tabular-nums">{m(booking.amountPaid)}</dd>
                </div>
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>Balance</dt>
                  <dd className="tabular-nums">{f.money(balance.toFixed(2), booking.currency)}</dd>
                </div>
              </dl>

              {booking.payments.length > 0 && (
                <ul className="divide-y divide-line border-y border-line text-sm">
                  {booking.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                      <span>
                        <span className="font-semibold">{m(p.amount)}</span> by {p.method.replace("_", " ")}
                        <span className="block text-ink-muted">
                          {f.when(p.createdAt)}, {p.provider === "MANUAL" ? `recorded by ${p.recordedBy ?? "staff"}` : `online (${p.provider.toLowerCase()})`}
                        </span>
                      </span>
                      {p.providerRef && <span className="text-xs text-ink-muted tabular-nums">{p.providerRef}</span>}
                    </li>
                  ))}
                </ul>
              )}

              {canTakePayment && (
                <div className="rounded-control border border-line p-4">
                  <h3 className="mb-3 font-bold">Record a payment</h3>
                  <ActionForm action={recordPaymentAction.bind(null, booking.id)} submitLabel="Record payment" resetOnSuccess>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <AdminField name="amount" label="Amount" required inputMode="decimal" defaultValue={balance.toFixed(2)} hint={`Balance ${f.money(balance.toFixed(2), booking.currency)}`} />
                      <AdminField name="method" label="Method" type="select" required options={METHODS} defaultValue="cash" />
                    </div>
                    <AdminField name="note" label="Note" placeholder="Receipt number, who paid…" />
                    {booking.status === "PENDING_PAYMENT" && (
                      <AdminCheckbox name="confirm" label="Also confirm the booking" defaultChecked hint="The customer gets a confirmation email." />
                    )}
                  </ActionForm>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          {actions.length > 0 && (
            <Card>
              <CardHeader title="Update status" />
              <CardBody>
                <StatusActions
                  actions={actions.map((to) => ({ to, label: STATUS_LABEL[to] }))}
                  action={changeStatusAction.bind(null, booking.id)}
                />
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Staff notes" description="Only staff see these." />
            <CardBody>
              <ActionForm action={saveNotesAction.bind(null, booking.id)} submitLabel="Save notes" submitVariant="secondary">
                <AdminField name="internalNotes" label="Notes" type="textarea" rows={5} defaultValue={booking.internalNotes} />
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="relative space-y-4 border-l-2 border-line pl-5">
                {booking.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full bg-brand ring-4 ring-surface" aria-hidden="true" />
                    <p className="font-semibold">
                      {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} to ${STATUS_LABEL[e.toStatus]}` : `Created as ${STATUS_LABEL[e.toStatus].toLowerCase()}`}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {f.when(e.createdAt)}
                      {e.actor ? `, by ${e.actor}` : ""}
                    </p>
                    {e.note && <p className="mt-1 text-sm">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Item({ label, value, wide = false, href }: { label: string; value: string; wide?: boolean; href?: string }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-semibold break-words tabular-nums">
        {href ? (
          <a href={href} className="underline underline-offset-4">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
