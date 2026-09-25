import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, AdminCheckboxGroup, AdminField } from "@/components/admin/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { formatMinuteOfDay } from "@/lib/display";
import { addHoursAction, deleteHoursAction } from "@/server/actions/admin/catalog";
import { listHours, listResources } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";
import { WEEKDAY_OPTIONS, adminFormat } from "../_shared/format";

export const metadata: Metadata = { title: "Opening hours", robots: { index: false } };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function HoursPage() {
  await requireArea("hours");
  const [hours, resources, f] = await Promise.all([listHours(), listResources(), adminFormat()]);
  const scopes = [
    { id: null as string | null, name: "Business hours", note: "Everyone follows these unless they have their own schedule." },
    ...resources
      .filter((r) => hours.some((h) => h.resourceId === r.id))
      .map((r) => ({ id: r.id as string | null, name: r.name, note: "Own schedule: business hours don't apply. Days without hours are days off." })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Opening hours</h1>
        <p className="max-w-prose text-ink-muted">
          When time slots can be booked (courts, salon services). Fixed-time packages like Day Tour ignore these. Days without hours are closed.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {scopes.map((scope) => {
          const rows = hours.filter((h) => h.resourceId === scope.id);
          return (
            <Card key={scope.id ?? "business"}>
              <CardHeader title={scope.name} description={scope.note} />
              <CardBody>
                {rows.length === 0 ? (
                  <p className="text-sm text-ink-muted">No hours set: closed every day.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {DAYS.map((day, weekday) => {
                      const today = rows.filter((h) => h.weekday === weekday);
                      return (
                        <li key={day} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <span className="w-28 font-semibold">{day}</span>
                          <span className="flex flex-1 flex-wrap items-center gap-2">
                            {today.length === 0 ? (
                              <span className="text-sm text-ink-muted">Closed</span>
                            ) : (
                              today.map((h) => (
                                <span key={h.id} className="inline-flex items-center gap-1 rounded-control border border-line py-0.5 pr-0.5 pl-2 text-sm tabular-nums">
                                  {formatMinuteOfDay(h.openMinute, f.locale)} to {formatMinuteOfDay(h.closeMinute, f.locale)}
                                  <ActionButton action={deleteHoursAction.bind(null, h.id)} label="Remove" variant="ghost" />
                                </span>
                              ))
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card className="max-w-3xl">
        <CardHeader title="Add hours" description="Add a break by adding two ranges for the same day, e.g. 9 to 12 and 1 to 6." />
        <CardBody>
          <ActionForm action={addHoursAction} submitLabel="Add hours" resetOnSuccess>
            <AdminField
              name="resourceId"
              label="For"
              type="select"
              options={[{ value: "", label: "Business hours (everyone)" }, ...resources.map((r) => ({ value: r.id, label: `${r.name} only` }))]}
            />
            <AdminCheckboxGroup name="weekdays" label="Days" options={WEEKDAY_OPTIONS} columns={7} />
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField name="openTime" label="Opens" type="time" required defaultValue="09:00" />
              <AdminField name="closeTime" label="Closes" type="time" required defaultValue="18:00" />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
