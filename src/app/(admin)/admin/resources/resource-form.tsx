import { ActionForm, AdminCheckbox, AdminField } from "@/components/admin/action-form";
import type { FormState } from "@/server/actions/admin/form";

type Resource = { slug: string; name: string; type: "SPACE" | "STAFF"; description: string | null; capacity: number | null; isActive: boolean; sortOrder: number };

export function ResourceForm({ action, resource }: { action: (s: FormState, f: FormData) => Promise<FormState>; resource?: Resource }) {
  return (
    <ActionForm action={action} submitLabel={resource ? "Save changes" : "Add"}>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField name="name" label="Name" required defaultValue={resource?.name} placeholder="Main Pool Villa" />
        <AdminField name="slug" label="Short name" required defaultValue={resource?.slug} placeholder="main-pool-villa" hint="Lowercase letters, numbers and dashes. Used in links." />
        <AdminField
          name="type"
          label="Kind"
          type="select"
          defaultValue={resource?.type ?? "SPACE"}
          options={[
            { value: "SPACE", label: "Place (villa, court, room…)" },
            { value: "STAFF", label: "Staff member (stylist, therapist…)" },
          ]}
        />
        <AdminField name="capacity" label="Capacity" type="number" min={1} defaultValue={resource?.capacity} hint="People it fits. For your reference." />
        <AdminField name="sortOrder" label="Order" type="number" min={0} defaultValue={resource?.sortOrder ?? 0} hint="Lower shows first; also who “First available” picks first." />
      </div>
      <AdminField name="description" label="Description" type="textarea" rows={3} defaultValue={resource?.description} />
      <AdminCheckbox name="isActive" label="Bookable" defaultChecked={resource?.isActive ?? true} hint="Untick to hide it from the site without losing its history." />
    </ActionForm>
  );
}
