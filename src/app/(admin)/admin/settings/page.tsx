import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-button";
import { ActionForm, AdminCheckboxGroup, AdminField } from "@/components/admin/action-form";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { removeLogoAction, saveSettingsAction, uploadLogoAction } from "@/server/actions/admin/settings";
import { blobEnabled } from "@/server/blob";
import { getSettings } from "@/server/data/settings";
import { env } from "@/server/env";
import { requireArea } from "@/server/session";
import { WEEKDAY_OPTIONS } from "../_shared/format";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  await requireArea("settings");
  const s = await getSettings();
  const provider = env().PAYMENT_PROVIDER;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-ink-muted">Changes apply to the website right away.</p>
      </div>
      <Card>
        <CardHeader title="Logo" description="Shown in the site header instead of the business name. PNG, JPEG or WebP, up to 1 MB." />
        <CardBody className="space-y-4">
          {s.logoUrl && (
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo of unknown size */}
              <img src={s.logoUrl} alt="Current logo" className="h-12 w-auto rounded border border-line bg-surface p-1" />
              <ActionButton action={removeLogoAction} label="Remove logo" />
            </div>
          )}
          {blobEnabled() ? (
            <ActionForm action={uploadLogoAction} submitLabel="Upload logo" submitVariant="secondary" resetOnSuccess>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Image file</span>
                <input
                  type="file"
                  name="logo"
                  accept="image/png,image/jpeg,image/webp"
                  required
                  className="block w-full text-sm file:mr-3 file:h-10 file:rounded-control file:border file:border-line-strong file:bg-surface file:px-3 file:font-semibold"
                />
              </label>
            </ActionForm>
          ) : (
            <p className="text-sm text-ink-muted">To upload a logo, connect a Vercel Blob store to this project (Storage → Blob). It sets BLOB_READ_WRITE_TOKEN.</p>
          )}
        </CardBody>
      </Card>

      <ActionForm action={saveSettingsAction} submitLabel="Save settings">
        <Card>
          <CardHeader title="Business" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <AdminField name="businessName" label="Business name" required defaultValue={s.businessName} />
            <AdminField name="tagline" label="Tagline" defaultValue={s.tagline} />
            <AdminField name="brandColor" label="Brand color" required defaultValue={s.brandColor} placeholder="#0e7c86" hint="A hex color. Text on it switches between white and dark automatically." />
            <AdminField name="contactPhone" label="Phone" type="tel" defaultValue={s.contactPhone} />
            <AdminField name="contactEmail" label="Email" type="email" defaultValue={s.contactEmail} hint="Customers' replies to booking emails go here." />
            <AdminField name="address" label="Address" defaultValue={s.address} className="sm:col-span-2" />
            <AdminField name="mapUrl" label="Map link" type="url" defaultValue={s.mapUrl} hint="Optional. Otherwise we link a Google Maps search for the address." className="sm:col-span-2" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Booking rules" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField
                name="currency"
                label="Currency"
                required
                defaultValue={s.currency}
                hint={provider === "paymongo" ? "PayMongo only accepts PHP." : "Three-letter code, e.g. PHP or USD."}
              />
              <AdminField name="timezone" label="Timezone" required defaultValue={s.timezone} hint="e.g. Asia/Manila. All times on the site use it." />
              <AdminField name="depositPercent" label="Deposit (%)" required inputMode="decimal" defaultValue={s.depositPercent} hint="100 means customers pay in full." />
              <AdminField
                name="holdMinutes"
                label="Hold while paying (minutes)"
                type="number"
                required
                min={5}
                defaultValue={s.holdMinutes}
                hint={provider === "stripe" ? "Use 30 or more with Stripe." : "How long a slot is held for an unpaid checkout."}
              />
              <AdminField name="leadTimeMin" label="Earliest booking (minutes ahead)" type="number" required min={0} defaultValue={s.leadTimeMin} />
              <AdminField name="maxAdvanceDays" label="Book up to (days ahead)" type="number" required min={1} defaultValue={s.maxAdvanceDays} />
            </div>
            <AdminCheckboxGroup name="weekendDays" label="Weekend rate days" hint="The day a booking starts decides the rate." options={WEEKDAY_OPTIONS} defaultValues={s.weekendDays.map(String)} columns={7} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Website" />
          <CardBody className="space-y-4">
            <AdminField name="headline" label="Headline" defaultValue={s.content.hero?.headline} />
            <AdminField name="subhead" label="Intro" type="textarea" rows={2} defaultValue={s.content.hero?.subhead} />
            <AdminField name="amenities" label="What's included" type="textarea" rows={5} defaultValue={s.content.amenities.join("\n")} hint="One per line." />
            <AdminField
              name="faq"
              label="Questions"
              type="textarea"
              rows={8}
              defaultValue={s.content.faq.map((q) => `${q.question}\n${q.answer}`).join("\n\n")}
              hint="The question on one line, the answer below it. Leave a blank line between questions."
            />
            <AdminField name="policies" label="Booking policy" type="textarea" rows={4} defaultValue={s.policies} hint="Customers agree to this before paying." />
          </CardBody>
        </Card>
      </ActionForm>
    </div>
  );
}
