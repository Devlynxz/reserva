import type { Metadata } from "next";
import Link from "next/link";
import { STATUS_LABEL } from "@/components/admin/status-badge";
import { Select, buttonStyles, cn } from "@/components/ui";
import type { BookingStatus } from "@/lib/booking-status";
import { type LocalDate, addDays, eachDate, isValidLocalDate, localDateOf, weekdayOf, zonedToUtc } from "@/lib/dates";
import { formatLocalDate, formatMonth } from "@/lib/display";
import { calendarItems } from "@/server/data/admin-bookings";
import { listResources } from "@/server/data/admin-catalog";
import { monthBounds } from "@/server/data/reports";
import { requireArea } from "@/server/session";
import { adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Calendar", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

const STATUS_STYLE: Partial<Record<BookingStatus, string>> = {
  PENDING_PAYMENT: "border-warning/60 bg-warning-soft",
  CONFIRMED: "border-brand/50 bg-brand-soft",
  COMPLETED: "border-line bg-surface-muted",
  NO_SHOW: "border-line bg-surface-muted text-ink-muted line-through",
};

export default async function CalendarPage({ searchParams }: { searchParams: Search }) {
  await requireArea("calendar");
  const params = await searchParams;
  const f = await adminFormat();
  const today = localDateOf(new Date(), f.tz);
  const view = one(params.view) === "week" ? "week" : "month";
  const anchor = one(params.date) && isValidLocalDate(one(params.date)!) ? one(params.date)! : today;
  const resources = (await listResources()).filter((r) => r.isActive);
  const resourceId = resources.find((r) => r.id === one(params.resource))?.id;

  // Visible range: a Sunday-first week, or the month padded out to whole weeks.
  let days: LocalDate[];
  if (view === "week") {
    const start = addDays(anchor, -weekdayOf(anchor));
    days = eachDate(start, addDays(start, 6));
  } else {
    const { first, last } = monthBounds(anchor.slice(0, 7));
    days = eachDate(addDays(first, -weekdayOf(first)), addDays(last, 6 - weekdayOf(last)));
  }
  const { bookings, blocks } = await calendarItems(zonedToUtc(days[0]!, 0, f.tz), zonedToUtc(addDays(days.at(-1)!, 1), 0, f.tz), resourceId);

  const dayOf = (d: Date) => localDateOf(d, f.tz);
  const byDay = new Map<LocalDate, typeof bookings>();
  for (const b of bookings) byDay.set(dayOf(b.startAt), [...(byDay.get(dayOf(b.startAt)) ?? []), b]);
  const blockedOn = (day: LocalDate, rid?: string) =>
    blocks.some(
      (b) =>
        (!rid || b.resourceId === null || b.resourceId === rid) &&
        b.startAt < zonedToUtc(addDays(day, 1), 0, f.tz) &&
        b.endAt > zonedToUtc(day, 0, f.tz),
    );

  const step = view === "week" ? 7 : 0;
  const prev = view === "week" ? addDays(anchor, -step) : `${shiftMonth(anchor, -1)}-01`;
  const next = view === "week" ? addDays(anchor, step) : `${shiftMonth(anchor, 1)}-01`;
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { view, date: anchor, resource: resourceId, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/admin/calendar?${q}`;
  };
  const title = view === "week" ? `${formatLocalDate(days[0]!, f.locale, "short")} to ${formatLocalDate(days[6]!, f.locale, "short")}` : formatMonth(anchor.slice(0, 7), f.locale);
  const resourceName = new Map(resources.map((r) => [r.id, r.name]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href({ date: prev })} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label="Previous">
            Previous
          </Link>
          <Link href={href({ date: today })} className={buttonStyles({ variant: "secondary", size: "sm" })}>
            Today
          </Link>
          <Link href={href({ date: next })} className={buttonStyles({ variant: "secondary", size: "sm" })} aria-label="Next">
            Next
          </Link>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
          <Link href={href({ view: "month" })} aria-current={view === "month" ? "page" : undefined} className={buttonStyles({ variant: view === "month" ? "primary" : "ghost", size: "sm" })}>
            Month
          </Link>
          <Link href={href({ view: "week" })} aria-current={view === "week" ? "page" : undefined} className={buttonStyles({ variant: view === "week" ? "primary" : "ghost", size: "sm" })}>
            Week
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchor} />
        <label className="space-y-1">
          <span className="text-sm font-semibold">Show</span>
          <Select name="resource" defaultValue={resourceId ?? ""} className="min-w-56">
            <option value="">Everything</option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" className={buttonStyles({ variant: "secondary" })}>
          Apply
        </button>
      </form>

      {view === "month" ? (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card" role="region" aria-label="Month" tabIndex={0}>
          <div className="grid min-w-[48rem] grid-cols-7 border-b border-line bg-surface-muted text-center text-xs font-semibold text-ink-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid min-w-[48rem] grid-cols-7">
            {days.map((day) => {
              const items = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
              return (
                <div key={day} className={cn("min-h-28 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-surface-muted/50")}>
                  <div className="flex items-center justify-between">
                    <span className={cn("flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums", day === today && "bg-brand text-brand-contrast", !inMonth && "text-ink-muted")}>
                      {Number(day.slice(8))}
                    </span>
                    {blockedOn(day, resourceId) && <span className="text-[11px] font-semibold text-danger">Blocked</span>}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {items.slice(0, 4).map((b) => (
                      <li key={b.id}>
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          title={`${STATUS_LABEL[b.status]}: ${b.offeringName}, ${b.customerName}`}
                          className={cn("block truncate rounded border px-1.5 py-0.5 text-xs", STATUS_STYLE[b.status])}
                        >
                          <span className="font-semibold tabular-nums">{f.time(b.startAt)}</span> {b.customerName}
                          {!resourceId && <span className="text-ink-muted">, {resourceName.get(b.resourceId)}</span>}
                        </Link>
                      </li>
                    ))}
                    {items.length > 4 && (
                      <li>
                        <Link href={`/admin/bookings?from=${day}&to=${day}`} className="text-xs font-semibold text-brand-ink underline-offset-2 hover:underline">
                          {items.length - 4} more
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card" role="region" aria-label="Week" tabIndex={0}>
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th scope="col" className="w-40 border-b border-line px-3 py-2 text-left font-semibold text-ink-muted">
                  <span className="sr-only">Place or staff</span>
                </th>
                {days.map((day) => (
                  <th key={day} scope="col" className={cn("border-b border-line px-2 py-2 text-left font-semibold", day === today && "text-brand-ink")}>
                    {formatLocalDate(day, f.locale, "short")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources
                .filter((r) => !resourceId || r.id === resourceId)
                .map((r) => (
                  <tr key={r.id} className="align-top">
                    <th scope="row" className="border-b border-line px-3 py-2 text-left font-semibold">
                      {r.name}
                    </th>
                    {days.map((day) => {
                      const items = (byDay.get(day) ?? []).filter((b) => b.resourceId === r.id);
                      return (
                        <td key={day} className={cn("border-b border-l border-line p-1.5", blockedOn(day, r.id) && "bg-danger-soft/60")}>
                          <ul className="space-y-1">
                            {items.map((b) => (
                              <li key={b.id}>
                                <Link href={`/admin/bookings/${b.id}`} className={cn("block rounded border px-1.5 py-1 text-xs", STATUS_STYLE[b.status])}>
                                  <span className="block font-semibold tabular-nums">
                                    {f.time(b.startAt)} to {f.time(b.endAt)}
                                  </span>
                                  <span className="block truncate">{b.customerName}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                          {blockedOn(day, r.id) && <span className="text-[11px] font-semibold text-danger">Blocked</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-ink-muted">Times are local to the business. Cancelled and expired bookings aren&apos;t shown.</p>
    </div>
  );
}

function shiftMonth(date: LocalDate, delta: number): string {
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
