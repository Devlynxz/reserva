import Link from "next/link";
import { PoweredByReserva } from "@/components/brand/reserva-logo";
import { buttonStyles } from "@/components/ui";
import { getSettingsOrNull } from "@/server/data/settings";
import { reservaConfig } from "@reserva/config";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettingsOrNull();
  const name = settings?.businessName ?? reservaConfig.brand.name;
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href="/" className="min-w-0 truncate font-heading text-lg font-bold tracking-tight sm:text-xl">
            {settings?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded logo of unknown size
              <img src={settings.logoUrl} alt={name} className="h-8 w-auto" />
            ) : (
              name
            )}
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
        {/* Extra bottom room on phones: pages pin a full-width action bar there. */}
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pt-8 pb-28 text-sm text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-8">
          <p>
            © {year} {name}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/sign-in" className="underline-offset-4 hover:text-ink hover:underline">
              Staff sign in
            </Link>
            <PoweredByReserva />
          </div>
        </div>
      </footer>
    </div>
  );
}
