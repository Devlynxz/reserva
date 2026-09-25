import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardBody, CardHeader, buttonStyles } from "@/components/ui";
import { formatMonth } from "@/lib/display";
import { dashboardData } from "@/server/data/reports";
import { requireArea } from "@/server/session";
import { adminFormat } from "./_shared/format";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

export default async function AdminDashboardPage() {
  const session = await requireArea("dashboard");
  const f = await adminFormat();
  const data = await dashboardData(new Date(), f.settings);
  const isOwner = session.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Dashboard</h1>
          <p className="text-ink-muted">{formatMonth(data.month.month, f.locale)} so far</p>
        </div>
        <Link href="/admin/bookings/new" className={buttonStyles()}>
          New booking
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today" value={String(data.today.length)} detail="bookings" />
        <Stat label="Next 7 days" value={String(data.upcomingCount)} detail={`${data.pendingCount} awaiting payment`} />
        <Stat label="Occupancy" value={`${Math.round(data.month.occupancy.rate * 100)}%`} detail={`${data.month.bookings} bookings this month`} />
        {isOwner ? (
          <Stat label="Collected" value={f.moneyShort(data.month.collected)} detail="payments this month" />
        ) : (
          <Stat label="Awaiting payment" value={String(data.pendingCount)} detail="upcoming bookings" />
        )}
      </dl>

      {data.attention.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader title="Needs attention" description="Money came in for these, but they aren't confirmed. Check each one and refund or re-book." />
          <CardBody className="pt-3">
            <ul className="divide-y divide-line">
              {data.attention.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/admin/bookings/${b.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {b.referenceCode}, {b.customerName}
                    </Link>
                    <p className="text-sm text-ink-muted">{b.reason}</p>
                  </div>
                  <StatusBadge status={b.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <BookingList
          title="Today"
          empty="Nothing booked today."
          rows={data.today.map((b) => ({ ...b, when: `${f.time(b.startAt)} to ${f.time(b.endAt)}` }))}
        />
        <BookingList
          title="Coming up"
          empty="Nothing booked in the next 7 days."
          rows={data.upcoming.map((b) => ({ ...b, when: f.when(b.startAt) }))}
          footer={
            data.upcomingCount > data.upcoming.length ? (
              <Link href="/admin/calendar?view=week" className="text-sm font-semibold text-brand-ink underline underline-offset-4">
                See all {data.upcomingCount} in the calendar
              </Link>
            ) : null
          }
        />
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-card border border-line bg-surface shadow-card p-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-xl font-extrabold break-words tabular-nums sm:text-2xl">{value}</dd>
      <dd className="text-sm text-ink-muted">{detail}</dd>
    </div>
  );
}

type Row = {
  id: string;
  referenceCode: string;
  status: Parameters<typeof StatusBadge>[0]["status"];
  when: string;
  customerName: string;
  guestCount: number;
  offeringName: string;
  resourceName: string;
};

function BookingList({ title, rows, empty, footer }: { title: string; rows: Row[]; empty: string; footer?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="pt-3">
        {rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{empty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((b) => (
              <li key={b.id}>
                <Link href={`/admin/bookings/${b.id}`} className="-mx-2 flex items-start justify-between gap-3 rounded-control px-2 py-3 hover:bg-surface-muted">
                  <span className="min-w-0">
                    <span className="block font-semibold tabular-nums">{b.when}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {b.customerName}
                      {b.guestCount > 1 ? ` (${b.guestCount})` : ""}, {b.offeringName} at {b.resourceName}
                    </span>
                  </span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {footer && <div className="mt-3">{footer}</div>}
      </CardBody>
    </Card>
  );
}
