import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui";
import { idSchema } from "@/lib/validation";
import { saveResourceAction } from "@/server/actions/admin/catalog";
import { getResource } from "@/server/data/admin-catalog";
import { requireArea } from "@/server/session";
import { ResourceForm } from "../resource-form";

export const metadata: Metadata = { title: "Edit place or staff", robots: { index: false } };

export default async function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  await requireArea("resources");
  const { id } = await params;
  const resource = idSchema.safeParse(id).success ? await getResource(id) : null;
  if (!resource) notFound();
  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/resources" className="text-sm font-semibold text-ink-muted hover:text-ink">
        Places &amp; staff
      </Link>
      <h1 className="text-2xl font-extrabold">{resource.name}</h1>
      <Card>
        <CardBody>
          <ResourceForm action={saveResourceAction.bind(null, resource.id)} resource={resource} />
        </CardBody>
      </Card>
    </div>
  );
}
