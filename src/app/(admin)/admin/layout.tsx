import Link from "next/link";
import { type NavGroup, AdminNav } from "@/components/admin/admin-nav";
import { ReservaLogo } from "@/components/brand/reserva-logo";
import { canAccess } from "@/lib/permissions";
import { getSettingsOrNull } from "@/server/data/settings";
import { requireArea } from "@/server/session";
import { reservaConfig } from "@reserva/config";
import { SignOutButton } from "./sign-out-button";

const GROUPS: NavGroup[] = [
  {
    label: "Bookings",
    items: [
      { href: "/admin", label: "Dashboard", area: "dashboard" },
      { href: "/admin/calendar", label: "Calendar", area: "calendar" },
      { href: "/admin/bookings", label: "Bookings", area: "bookings" },
      { href: "/admin/bookings/new", label: "New booking", area: "bookings" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/resources", label: "Places & staff", area: "resources" },
      { href: "/admin/offerings", label: "Packages & services", area: "offerings" },
      { href: "/admin/hours", label: "Opening hours", area: "hours" },
      { href: "/admin/pricing", label: "Special rates", area: "pricing" },
      { href: "/admin/blocked", label: "Blocked dates", area: "blocked" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/admin/reports", label: "Reports", area: "reports" },
      { href: "/admin/team", label: "Team", area: "team" },
      { href: "/admin/settings", label: "Settings", area: "settings" },
    ],
  },
];

// Every admin page sits behind this check. Pages ALSO call requireArea() for their own
// area (layouts don't re-run on client navigation), and every action checks again.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireArea("dashboard");
  const settings = await getSettingsOrNull();
  // Staff never see links to owner-only areas (the pages 404 for them anyway).
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canAccess(session.role, i.area)) })).filter((g) => g.items.length);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <ReservaLogo variant="mark" height={28} />
            <span className="truncate font-heading text-lg font-bold">{settings?.businessName ?? reservaConfig.brand.name}</span>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/" className="hidden text-sm font-semibold text-ink-muted hover:text-ink sm:inline">
              View site
            </Link>
            <span className="hidden text-sm text-ink-muted md:inline">
              {session.name}, {session.role === "ADMIN" ? "Owner" : "Staff"}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl gap-8 px-4 sm:px-6 lg:grid lg:grid-cols-[13rem_1fr] lg:py-8">
        <AdminNav groups={groups} />
        <main id="main" className="min-w-0 py-6 lg:py-0">
          {children}
        </main>
      </div>
    </div>
  );
}
