import Link from "next/link";
import { requireArea } from "@/server/session";
import { reservaConfig } from "@reserva/config";
import { SignOutButton } from "./sign-out-button";

// Every admin page sits behind this check. Admin-only pages ALSO call requireArea()
// themselves — layouts don't re-run on client navigation between sibling pages.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireArea("dashboard");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/admin" className="font-extrabold">
            {reservaConfig.brand.name}
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">
              {session.name} · {session.role === "ADMIN" ? "Owner" : "Staff"}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
