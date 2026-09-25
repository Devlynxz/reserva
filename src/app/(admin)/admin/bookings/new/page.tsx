import type { Metadata } from "next";
import { ActionForm, AdminCheckbox, AdminField } from "@/components/admin/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { localDateOf } from "@/lib/dates";
import { describeSchedule } from "@/lib/display";
import { createManualBookingAction } from "@/server/actions/admin/bookings";
import { listPublicOfferings } from "@/server/data/public";
import { requireArea } from "@/server/session";
import { adminFormat } from "../../_shared/format";

export const metadata: Metadata = { title: "New booking", robots: { index: false } };

// Walk-ins and bookings taken over Messenger/phone. Same createBooking as the website,
// so the same rules apply (no double booking, blocks, buffers, grid); staff just aren't
// bound by the online lead time or booking horizon.
export default async function NewBookingPage() {
  await requireArea("bookings");
  const [offerings, f] = await Promise.all([listPublicOfferings(), adminFormat()]);
  const today = localDateOf(new Date(), f.tz);
  const resources = [...new Map(offerings.flatMap((o) => o.resources).map((r) => [r.id, r])).values()];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">New booking</h1>
        <p className="text-ink-muted">For walk-ins and bookings made by message or phone.</p>
      </div>
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <ActionForm action={createManualBookingAction} submitLabel="Create booking">
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                name="source"
                label="How did they book?"
                type="select"
                defaultValue="WALK_IN"
                options={[
                  { value: "WALK_IN", label: "Walk-in" },
                  { value: "MESSAGE", label: "Message or phone" },
                ]}
              />
              <AdminField
                name="offeringId"
                label="Package or service"
                type="select"
                required
                options={offerings.map((o) => ({ value: o.id, label: `${o.name} (${describeSchedule(o, f.locale)})` }))}
              />
              <AdminField
                name="resourceId"
                label="Place or staff"
                type="select"
                defaultValue="any"
                hint="Must be one the package is offered at."
                options={[{ value: "any", label: "First available" }, ...resources.map((r) => ({ value: r.id, label: r.name }))]}
              />
              <AdminField name="guestCount" label="Guests" type="number" required min={1} defaultValue={1} />
              <AdminField name="date" label="Date" type="date" required defaultValue={today} />
              <AdminField name="startTime" label="Start time" type="time" hint="For services and courts only. Packages use their fixed time." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField name="customerName" label="Customer name" required autoComplete="off" />
              <AdminField name="customerEmail" label="Customer email" type="email" required autoComplete="off" />
              <AdminField name="customerPhone" label="Phone" type="tel" autoComplete="off" />
            </div>
            <AdminField name="customerNotes" label="Customer's request" type="textarea" rows={2} />
            <AdminField name="internalNotes" label="Staff notes" type="textarea" rows={2} />
            <AdminCheckbox
              name="awaitingPayment"
              label="Still waiting for payment"
              hint="Keeps the booking pending (it won't expire) until you record a payment. Leave unticked to confirm it now."
            />
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
