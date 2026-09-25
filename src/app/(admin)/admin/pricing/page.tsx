import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, AdminField } from "@/components/admin/action-form";
import { Card, CardBody, CardHeader, Table, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { formatLocalDate } from "@/lib/display";
import { createOverrideAction, deleteOverrideAction } from "@/server/actions/admin/catalog";
import { listOfferings, listOverrides, listResources } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";
import { adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Special rates", robots: { index: false } };

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function PricingPage() {
  await requireArea("pricing");
  const [overrides, resources, offerings, f] = await Promise.all([listOverrides(), listResources(), listOfferings(), adminFormat()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Special rates</h1>
        <p className="max-w-prose text-ink-muted">
          Change prices for a date range, like Holy Week or Christmas. The most specific rate wins: one for a package at a place beats one for the whole business.
        </p>
      </div>

      <Table label="Special rates">
        <THead>
          <tr>
            <Th>Name</Th>
            <Th>Dates</Th>
            <Th>Applies to</Th>
            <Th className="text-right">Rate</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {overrides.length === 0 && <TableEmpty colSpan={5}>No special rates. Regular and weekend prices apply.</TableEmpty>}
          {overrides.map((o) => (
            <Tr key={o.id}>
              <Td className="font-semibold">{o.label}</Td>
              <Td className="tabular-nums">
                {formatLocalDate(day(o.startDate), f.locale, "short")} to {formatLocalDate(day(o.endDate), f.locale, "short")}
              </Td>
              <Td>{[o.offering?.name ?? "All packages", o.resource?.name ?? "everywhere"].join(", ")}</Td>
              <Td numeric>{o.fixedPrice ? f.money(o.fixedPrice.toString()) : `× ${o.multiplier?.toString()}`}</Td>
              <Td className="text-right">
                <ActionButton
                  action={deleteOverrideAction.bind(null, o.id)}
                  label="Delete"
                  confirm={{ title: `Delete “${o.label}”?`, description: "Bookings already made keep the price they were quoted.", confirmLabel: "Delete rate" }}
                />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card className="max-w-3xl">
        <CardHeader title="Add a special rate" />
        <CardBody>
          <ActionForm action={createOverrideAction} submitLabel="Add rate" resetOnSuccess>
            <AdminField name="label" label="Name" required placeholder="Holy Week" hint="Shown to customers on their price breakdown." />
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField name="startDate" label="From" type="date" required />
              <AdminField name="endDate" label="To (inclusive)" type="date" required />
              <AdminField name="offeringId" label="Package" type="select" options={[{ value: "", label: "All packages" }, ...offerings.map((o) => ({ value: o.id, label: o.name }))]} />
              <AdminField name="resourceId" label="Place or staff" type="select" options={[{ value: "", label: "Everywhere" }, ...resources.map((r) => ({ value: r.id, label: r.name }))]} />
              <AdminField
                name="rule"
                label="Rate"
                type="select"
                defaultValue="multiplier"
                options={[
                  { value: "multiplier", label: "Multiply the price by…" },
                  { value: "fixed", label: "Fixed price of…" },
                ]}
              />
              <AdminField name="value" label="Value" required inputMode="decimal" placeholder="1.5 or 18000" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
