import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Table, TableEmpty, TBody, Td, Th, THead, Tr, buttonStyles } from "@/components/ui";
import { describeSchedule } from "@/lib/display";
import { listOfferings } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";
import { adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Packages & services", robots: { index: false } };

export default async function OfferingsPage() {
  await requireArea("offerings");
  const [offerings, f] = await Promise.all([listOfferings(), adminFormat()]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Packages &amp; services</h1>
          <p className="max-w-prose text-ink-muted">What customers choose when they book, with its timing and price.</p>
        </div>
        <Link href="/admin/offerings/new" className={buttonStyles()}>
          Add
        </Link>
      </div>
      <Table label="Packages and services">
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Timing</Th>
            <Th>Where</Th>
            <Th className="text-right">Price</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {offerings.length === 0 && <TableEmpty colSpan={5}>Nothing yet. Add a package or service.</TableEmpty>}
          {offerings.map((o) => (
            <Tr key={o.id}>
              <Td>
                <Link href={`/admin/offerings/${o.id}`} className="font-semibold underline-offset-4 hover:underline">
                  {o.name}
                </Link>
              </Td>
              <Td className="tabular-nums">{describeSchedule(o, f.locale)}</Td>
              <Td>{o.resources.map((r) => r.name).join(", ") || <span className="text-danger">Nowhere yet</span>}</Td>
              <Td numeric>{f.money(o.basePrice.toString())}</Td>
              <Td>{o.isActive ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
