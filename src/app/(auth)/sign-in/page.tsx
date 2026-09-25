import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { safeAdminRedirect } from "@/lib/safe-redirect";
import { getStaffSession } from "@/server/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAdminRedirect((await searchParams).next);
  if (await getStaffSession()) redirect(next);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader as="h1" title="Sign in" description="For staff and owners. Customers don't need an account." />
        <CardBody>
          <SignInForm next={next} />
        </CardBody>
      </Card>
    </main>
  );
}
