import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { saveOfferingAction } from "@/server/actions/admin/catalog";
import { listResources } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";
import { OfferingForm } from "../offering-form";

export const metadata: Metadata = { title: "Add package or service", robots: { index: false } };

export default async function NewOfferingPage() {
  await requireArea("offerings");
  const resources = await listResources();
  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/offerings" className="text-sm font-semibold text-ink-muted hover:text-ink">
        Packages &amp; services
      </Link>
      <h1 className="text-2xl font-extrabold">Add a package or service</h1>
      <Card>
        <CardBody>
          <OfferingForm action={saveOfferingAction.bind(null, null)} resources={resources.map((r) => ({ value: r.id, label: r.name }))} />
        </CardBody>
      </Card>
    </div>
  );
}
