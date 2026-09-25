import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, AdminField } from "@/components/admin/action-form";
import { Card, CardBody, CardHeader, Table, TableEmpty, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { localDateOf } from "@/lib/dates";
import { createBlockAction, deleteBlockAction } from "@/server/actions/admin/catalog";
import { listResources, listUpcomingBlocks } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";
import { adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Blocked dates", robots: { index: false } };

export default async function BlockedPage() {
  await requireArea("blocked");
  const now = new Date();
  const [blocks, resources, f] = await Promise.all([listUpcomingBlocks(now), listResources(), adminFormat()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Blocked dates</h1>
        <p className="max-w-prose text-ink-muted">Close a place, a staff member or the whole business for maintenance, holidays or days off. Nobody can book a blocked time.</p>
      </div>

      <Table label="Blocked dates">
        <THead>
          <tr>
            <Th>When</Th>
            <Th>What</Th>
            <Th>Reason</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </THead>
        <TBody>
          {blocks.length === 0 && <TableEmpty colSpan={4}>Nothing blocked from today on.</TableEmpty>}
          {blocks.map((b) => (
            <Tr key={b.id}>
              <Td className="tabular-nums">{f.range(b.startAt, b.endAt)}</Td>
              <Td>{b.resource?.name ?? <span className="font-semibold">Whole business</span>}</Td>
              <Td>{b.reason ?? <span className="text-ink-muted">None given</span>}</Td>
              <Td className="text-right">
                <ActionButton
                  action={deleteBlockAction.bind(null, b.id)}
                  label="Unblock"
                  confirm={{ title: "Unblock this time?", description: "It becomes bookable again right away.", confirmLabel: "Unblock" }}
                />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      <Card className="max-w-3xl">
        <CardHeader title="Block time" description="If there are bookings in that time, cancel or move them first." />
        <CardBody>
          <ActionForm action={createBlockAction} submitLabel="Block" resetOnSuccess>
            <AdminField name="resourceId" label="What" type="select" options={[{ value: "", label: "Whole business" }, ...resources.map((r) => ({ value: r.id, label: r.name }))]} />
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField name="startDate" label="From" type="date" required defaultValue={localDateOf(now, f.tz)} />
              <AdminField name="startTime" label="From time" type="time" hint="Empty = start of the day." />
              <AdminField name="endDate" label="To" type="date" required defaultValue={localDateOf(now, f.tz)} />
              <AdminField name="endTime" label="To time" type="time" hint="Empty = end of the day." />
            </div>
            <AdminField name="reason" label="Reason" placeholder="Pool maintenance" hint="For staff only." />
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
