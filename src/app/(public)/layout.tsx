import Link from "next/link";
import { BusinessBrand } from "@/components/brand/business-brand";
import { PoweredByReserva } from "@/components/brand/reserva-logo";
import { buttonStyles } from "@/components/ui";
import { brandMark } from "@/lib/brand-assets";
import { getSettingsOrNull } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettingsOrNull();
  const name = settings?.businessName ?? reservaConfig.brand.name;
  const mark = brandMark({ businessName: name, logoUrl: settings?.logoUrl ?? null, iconUrl: settings?.iconUrl ?? null });
  const year = new Date().getFullYear();

  return (
    <div className="group/page flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center">
            <BusinessBrand mark={mark} />
          </Link>
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/lookup" className={buttonStyles({ variant: "ghost", size: "sm" })}>
              Find my booking
            </Link>
            {/* Wrapped: the sticky bar covers mobile, and a class on the button can't beat its own inline-flex. */}
            <span className="hidden sm:block">
              <Link href="/book" className={buttonStyles({ size: "sm" })}>
                Book now
              </Link>
            </span>
          </nav>
        </div>
      </header>

      <div id="main" className="flex-1">
        {children}
      </div>

      <footer className="border-t border-line bg-surface">
        {/* Room for a pinned action bar, only when the page shows one (data-action-bar;
            "mobile" bars are hidden from sm up), so the footer is never covered. */}
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-8 pb-8 text-sm text-ink-muted group-has-[[data-action-bar]]/page:pb-28 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:group-has-[[data-action-bar=mobile]]/page:pb-8">
          <p>
            © {year} {name}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/sign-in" className="underline-offset-4 hover:text-ink hover:underline">
              Staff sign in
            </Link>
            {(settings?.showPoweredBy ?? true) && <PoweredByReserva />}
          </div>
        </div>
      </footer>
    </div>
  );
}
