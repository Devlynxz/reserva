"use client";

import { useState } from "react";
import { ActionForm, AdminCheckbox, AdminCheckboxGroup, AdminField } from "@/components/admin/action-form";
import type { FormState } from "@/server/actions/admin/form";

export type OfferingFormValues = {
  slug: string;
  name: string;
  description: string | null;
  mode: "WINDOW" | "SLOT";
  startTime: string | null;
  endTime: string | null;
  durationMin: number | null;
  slotStepMin: number | null;
  bufferMin: number;
  basePrice: string;
  weekendPrice: string | null;
  includedGuests: number;
  maxGuests: number;
  extraGuestFee: string;
  isActive: boolean;
  sortOrder: number;
  resourceIds: string[];
};

/** One form for both booking modes; the mode switch shows only the fields that apply. */
export function OfferingForm({
  action,
  offering,
  resources,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  offering?: OfferingFormValues;
  resources: Array<{ value: string; label: string }>;
}) {
  const [mode, setMode] = useState<"WINDOW" | "SLOT">(offering?.mode ?? "WINDOW");
  return (
    <ActionForm action={action} submitLabel={offering ? "Save changes" : "Add"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField name="name" label="Name" required defaultValue={offering?.name} placeholder="Overnight" />
        <AdminField name="slug" label="Short name" required defaultValue={offering?.slug} placeholder="overnight" hint="Lowercase letters, numbers and dashes." />
      </div>
      <AdminField name="description" label="Description" type="textarea" rows={2} defaultValue={offering?.description} />

      <fieldset className="space-y-3 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold">How it&apos;s booked</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["WINDOW", "Fixed time", "Same hours every time, e.g. Day Tour 8 AM to 5 PM, Overnight 7 PM to 7 AM."],
              ["SLOT", "Time slots", "A set length within opening hours, e.g. a 60-minute court or a 45-minute haircut."],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-3 rounded-control border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="mt-1 accent-[var(--brand)]" />
              <span>
                <span className="font-semibold">{label}</span>
                <span className="block text-sm text-ink-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        {mode === "WINDOW" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField name="startTime" label="Starts" type="time" required defaultValue={offering?.startTime} />
            <AdminField name="endTime" label="Ends" type="time" required defaultValue={offering?.endTime} hint="Earlier than the start means the next day." />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField name="durationMin" label="Length (minutes)" type="number" required min={5} defaultValue={offering?.durationMin} />
            <AdminField name="slotStepMin" label="Start every (minutes)" type="number" required min={5} defaultValue={offering?.slotStepMin} hint="15 offers 9:00, 9:15, 9:30…" />
          </div>
        )}
        <AdminField name="bufferMin" label="Turnover time (minutes)" type="number" min={0} defaultValue={offering?.bufferMin ?? 0} hint="Cleaning or reset time kept free after each booking." />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <AdminField name="basePrice" label="Price" required inputMode="decimal" defaultValue={offering?.basePrice} />
        <AdminField name="weekendPrice" label="Weekend price" inputMode="decimal" defaultValue={offering?.weekendPrice} hint="Leave empty to use the price." />
        <AdminField name="extraGuestFee" label="Per extra guest" inputMode="decimal" defaultValue={offering?.extraGuestFee ?? "0"} />
        <AdminField name="includedGuests" label="Guests included" type="number" required min={1} defaultValue={offering?.includedGuests ?? 1} />
        <AdminField name="maxGuests" label="Most guests" type="number" required min={1} defaultValue={offering?.maxGuests ?? 1} />
        <AdminField name="sortOrder" label="Order" type="number" min={0} defaultValue={offering?.sortOrder ?? 0} />
      </div>

      <AdminCheckboxGroup
        name="resourceIds"
        label="Where or with whom"
        hint="Customers can pick one of these, or take the first available."
        options={resources}
        defaultValues={offering?.resourceIds}
      />
      <AdminCheckbox name="isActive" label="Bookable" defaultChecked={offering?.isActive ?? true} hint="Untick to hide it from the site." />
    </ActionForm>
  );
}
