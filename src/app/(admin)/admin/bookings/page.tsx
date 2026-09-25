import type { Metadata } from "next";
import Link from "next/link";
import { SOURCE_LABEL, STATUS_LABEL, StatusBadge } from "@/components/admin/status-badge";
import { Input, Select, Table, TableEmpty, TBody, Td, Th, THead, Tr, buttonStyles } from "@/components/ui";
import { BOOKING_SOURCES, BOOKING_STATUSES, type BookingSource, type BookingStatus } from "@/lib/booking-status";
import { isValidLocalDate } from "@/lib/dates";
import { listBookings } from "@/server/data/admin-bookings";
import { requireArea } from "@/server/session";
import { adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function BookingsPage({ searchParams }: { searchParams: Search }) {
  await requireArea("bookings");
  const params = await searchParams;
  const f = await adminFormat();

  // Filters come from the URL, so they're shareable and survive reloads. Unknown values are ignored.
  const status = BOOKING_STATUSES.includes(one(params.status) as BookingStatus) ? (one(params.status) as BookingStatus) : undefined;
  const source = BOOKING_SOURCES.includes(one(params.source) as BookingSource) ? (one(params.source) as BookingSource) : undefined;
  const from = one(params.from) && isValidLocalDate(one(params.from)!) ? one(params.from) : undefined;
  const to = one(params.to) && isValidLocalDate(one(params.to)!) ? one(params.to) : undefined;
  const q = one(params.q)?.slice(0, 100);
  const page = Math.max(1, Number(one(params.page)) || 1);

  const result = await listBookings({ status, source, from, to, q, page }, f.tz);
  const pageHref = (p: number) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, source, from, to, q })) if (v) next.set(k, v);
    next.set("page", String(p));
    return `/admin/bookings?${next}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Bookings</h1>
          <p className="text-ink-muted">
            {result.total} {result.total === 1 ? "booking" : "bookings"}
          </p>
        </div>
        <Link href="/admin/bookings/new" className={buttonStyles()}>
          New booking
        </Link>
      </div>

      <form className="grid gap-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <label className="space-y-1 lg:col-span-2">
          <span className="text-sm font-semibold">Search</span>
          <Input name="q" defaultValue={q} placeholder="Reference, name, email or phone" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-semibold">Status</span>
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-semibold">Source</span>
          <Select name="source" defaultValue={source ?? ""}>
            <option value="">Any</option>
            {BOOKING_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-semibold">From</span>
          <Input type="date" name="from" defaultValue={from} />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-semibold">To</span>
          <Input type="date" name="to" defaultValue={to} />
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <button type="submit" className={buttonStyles({ variant: "secondary" })}>
            Filter
          </button>
          <Link href="/admin/bookings" className={buttonStyles({ variant: "ghost" })}>
            Clear
          </Link>
        </div>
      </form>

      <Table label="Bookings">
        <THead>
          <tr>
            <Th>Reference</Th>
            <Th>When</Th>
            <Th>Customer</Th>
            <Th>Package</Th>
            <Th>Status</Th>
            <Th className="text-right">Paid / total</Th>
          </tr>
        </THead>
        <TBody>
          {result.rows.length === 0 && <TableEmpty colSpan={6}>No bookings match these filters.</TableEmpty>}
          {result.rows.map((b) => (
            <Tr key={b.id}>
              <Td>
                <Link href={`/admin/bookings/${b.id}`} className="font-semibold tabular-nums underline-offset-4 hover:underline">
                  {b.referenceCode}
                </Link>
                <span className="block text-xs text-ink-muted">{SOURCE_LABEL[b.source]}</span>
              </Td>
              <Td className="tabular-nums">{f.when(b.startAt)}</Td>
              <Td>
                {b.customerName}
                <span className="block text-xs text-ink-muted">{b.customerEmail}</span>
              </Td>
              <Td>
                {b.offeringName}
                <span className="block text-xs text-ink-muted">{b.resourceName}</span>
              </Td>
              <Td>
                <StatusBadge status={b.status} />
              </Td>
              <Td numeric>
                {f.money(b.amountPaid, b.currency)}
                <span className="block text-xs text-ink-muted">of {f.money(b.totalAmount, b.currency)}</span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      {result.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-ink-muted tabular-nums">
            Page {result.page} of {result.pages}
          </span>
          {page < result.pages ? (
            <Link href={pageHref(page + 1)} className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
