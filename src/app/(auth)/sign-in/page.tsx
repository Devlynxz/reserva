import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReservaLogo } from "@/components/brand/reserva-logo";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { safeAdminRedirect } from "@/lib/safe-redirect";
import { isDemo } from "@/server/demo";
import { getStaffSession } from "@/server/session";
import { DemoSignIn } from "./demo-sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAdminRedirect((await searchParams).next);
  if (await getStaffSession()) redirect(next);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <ReservaLogo height={44} label="Reserva" />
      <Card className="w-full max-w-sm">
        <CardHeader as="h1" title="Sign in" description="For staff and owners. Customers don't need an account." />
        <CardBody className="space-y-5">
          {isDemo() && <DemoSignIn />}
          <SignInForm next={next} />
        </CardBody>
      </Card>
    </main>
  );
}
