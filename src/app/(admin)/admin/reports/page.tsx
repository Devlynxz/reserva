import type { Metadata } from "next";
import { STATUS_LABEL } from "@/components/admin/status-badge";
import { Card, CardBody, CardHeader, Input, Table, TableEmpty, TBody, Td, Th, THead, Tr, buttonStyles } from "@/components/ui";
import { BOOKING_STATUSES } from "@/lib/booking-status";
import { localDateOf } from "@/lib/dates";
import { formatMonth } from "@/lib/display";
import { monthReport } from "@/server/data/reports";
import { requireArea } from "@/server/session";
import { adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

type Search = Promise<{ month?: string | string[] }>;

export default async function ReportsPage({ searchParams }: { searchParams: Search }) {
  await requireArea("reports");
  const f = await adminFormat();
  const param = (await searchParams).month;
  const current = localDateOf(new Date(), f.tz).slice(0, 7);
  const month = typeof param === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : current;
  const report = await monthReport(month, f.settings);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{formatMonth(month, f.locale)}</h1>
          <p className="text-ink-muted">Bookings that start this month, and money received during it.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <form className="flex items-end gap-2">
            <label className="space-y-1">
              <span className="text-sm font-semibold">Month</span>
              <Input type="month" name="month" defaultValue={month} />
            </label>
            <button type="submit" className={buttonStyles({ variant: "secondary" })}>
              Show
            </button>
          </form>
          <a href={`/api/admin/reports/export?month=${month}`} className={buttonStyles()} download>
            Download CSV
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Collected" value={f.moneyShort(report.collected.total)} detail={`${report.collected.count} payments`} />
        <Stat label="Booked value" value={f.moneyShort(report.booked)} detail="confirmed, completed, no-shows" />
        <Stat label="Bookings" value={String(report.totalBookings)} detail="all statuses" />
        <Stat label="Occupancy" value={`${Math.round(report.occupancy.rate * 100)}%`} detail={`${Math.round(report.occupancy.bookedMinutes / 60)} of ${Math.round(report.occupancy.bookableMinutes / 60)} hours`} />
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="By package" />
          <CardBody className="pt-3">
            <Table label="By package" className="border-0">
              <THead>
                <tr>
                  <Th>Package</Th>
                  <Th className="text-right">Bookings</Th>
                  <Th className="text-right">Value</Th>
                </tr>
              </THead>
              <TBody>
                {report.offerings.length === 0 && <TableEmpty colSpan={3}>No confirmed bookings this month.</TableEmpty>}
                {report.offerings.map((o) => (
                  <Tr key={o.name}>
                    <Td>{o.name}</Td>
                    <Td numeric>{o.count}</Td>
                    <Td numeric>{f.money(o.booked)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Payments by method" />
            <CardBody>
              {report.collected.byMethod.length === 0 ? (
                <p className="text-sm text-ink-muted">No payments this month.</p>
              ) : (
                <dl className="space-y-2">
                  {report.collected.byMethod.map((m) => (
                    <div key={m.method} className="flex justify-between gap-4">
                      <dt className="capitalize">
                        {m.method.replace("_", " ")} <span className="text-ink-muted">({m.count})</span>
                      </dt>
                      <dd className="font-semibold tabular-nums">{f.money(m.total)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Bookings by status" />
            <CardBody>
              <dl className="space-y-2">
                {BOOKING_STATUSES.map((s) => (
                  <div key={s} className="flex justify-between gap-4">
                    <dt>{STATUS_LABEL[s]}</dt>
                    <dd className="font-semibold tabular-nums">{report.byStatus[s] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
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
