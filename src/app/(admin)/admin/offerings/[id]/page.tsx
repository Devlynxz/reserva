import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { idSchema } from "@/lib/validation";
import { saveOfferingAction } from "@/server/actions/admin/catalog";
import { getOffering, listResources } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";

// The mode-switching form is only needed on these two pages: load it as its own chunk.
const OfferingForm = dynamic(() => import("../offering-form").then((m) => m.OfferingForm), {
  loading: () => <div className="h-96 animate-pulse rounded-card bg-surface-muted" />,
});

export const metadata: Metadata = { title: "Edit package or service", robots: { index: false } };

export default async function EditOfferingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireArea("offerings");
  const { id } = await params;
  const [offering, resources] = await Promise.all([idSchema.safeParse(id).success ? getOffering(id) : null, listResources()]);
  if (!offering) notFound();
  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/offerings" className="text-sm font-semibold text-ink-muted hover:text-ink">
        Packages &amp; services
      </Link>
      <h1 className="text-2xl font-extrabold">{offering.name}</h1>
      <Card>
        <CardBody>
          <OfferingForm
            action={saveOfferingAction.bind(null, offering.id)}
            resources={resources.map((r) => ({ value: r.id, label: r.name }))}
            offering={{
              slug: offering.slug,
              name: offering.name,
              description: offering.description,
              mode: offering.mode,
              startTime: offering.startMinute === null ? null : formatTime(offering.startMinute),
              endTime: offering.endMinute === null ? null : formatTime(offering.endMinute),
              durationMin: offering.durationMin,
              slotStepMin: offering.slotStepMin,
              bufferMin: offering.bufferMin,
              basePrice: offering.basePrice.toString(),
              weekendPrice: offering.weekendPrice?.toString() ?? null,
              includedGuests: offering.includedGuests,
              maxGuests: offering.maxGuests,
              extraGuestFee: offering.extraGuestFee.toString(),
              isActive: offering.isActive,
              sortOrder: offering.sortOrder,
              resourceIds: offering.resources.map((r) => r.id),
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
