import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BusinessBrand } from "@/components/brand/business-brand";
import { PoweredByReserva } from "@/components/brand/reserva-logo";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { brandMark } from "@/lib/brand-assets";
import { safeAdminRedirect } from "@/lib/safe-redirect";
import { isDemo } from "@/server/demo";
import { getSettingsOrNull } from "@/server/data/settings";
import { getStaffSession } from "@/server/session";
import { reservaConfig } from "@reserva/config";
import { DemoSignIn } from "./demo-sign-in";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAdminRedirect((await searchParams).next);
  if (await getStaffSession()) redirect(next);
  const settings = await getSettingsOrNull();
  const mark = brandMark({
    businessName: settings?.businessName ?? reservaConfig.brand.name,
    logoUrl: settings?.logoUrl ?? null,
    iconUrl: settings?.iconUrl ?? null,
  });

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <BusinessBrand mark={mark} className="max-w-full" />
      <Card className="w-full max-w-sm">
        <CardHeader as="h1" title="Sign in" description="For staff and owners. Customers don't need an account." />
        <CardBody className="space-y-5">
          {isDemo() && <DemoSignIn />}
          <SignInForm next={next} />
        </CardBody>
      </Card>
      {(settings?.showPoweredBy ?? true) && <PoweredByReserva />}
    </main>
  );
}
