import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Table, TableEmpty, TBody, Td, Th, THead, Tr, buttonStyles } from "@/components/ui";
import { listResources } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";

export const metadata: Metadata = { title: "Places & staff", robots: { index: false } };

export default async function ResourcesPage() {
  await requireArea("resources");
  const resources = await listResources();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Places &amp; staff</h1>
          <p className="max-w-prose text-ink-muted">What customers book: a villa, a court, a room, or a person. Each can take one booking at a time.</p>
        </div>
        <Link href="/admin/resources/new" className={buttonStyles()}>
          Add
        </Link>
      </div>
      <Table label="Places and staff">
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Kind</Th>
            <Th className="text-right">Packages</Th>
            <Th className="text-right">Bookings</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {resources.length === 0 && <TableEmpty colSpan={5}>Nothing yet. Add the first place or staff member.</TableEmpty>}
          {resources.map((r) => (
            <Tr key={r.id}>
              <Td>
                <Link href={`/admin/resources/${r.id}`} className="font-semibold underline-offset-4 hover:underline">
                  {r.name}
                </Link>
                {r.description && <span className="block max-w-md truncate text-xs text-ink-muted">{r.description}</span>}
              </Td>
              <Td>{r.type === "STAFF" ? "Staff" : "Place"}</Td>
              <Td numeric>{r._count.offerings}</Td>
              <Td numeric>{r._count.bookings}</Td>
              <Td>{r.isActive ? <Badge tone="success">Active</Badge> : <Badge>Hidden</Badge>}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
