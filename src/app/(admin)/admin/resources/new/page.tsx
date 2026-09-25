import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui";
import { saveResourceAction } from "@/server/actions/admin/catalog";
import { requireArea } from "@/server/session";
import { ResourceForm } from "../resource-form";

export const metadata: Metadata = { title: "Add place or staff", robots: { index: false } };

export default async function NewResourcePage() {
  await requireArea("resources");
  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/admin/resources" className="text-sm font-semibold text-ink-muted hover:text-ink">
        Places &amp; staff
      </Link>
      <h1 className="text-2xl font-extrabold">Add a place or staff member</h1>
      <Card>
        <CardBody>
          <ResourceForm action={saveResourceAction.bind(null, null)} />
        </CardBody>
      </Card>
    </div>
  );
}
