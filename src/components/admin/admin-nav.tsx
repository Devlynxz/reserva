"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui";
import type { AdminArea } from "@/lib/permissions";

export type NavItem = { href: string; label: string; area: AdminArea };
export type NavGroup = { label: string; items: NavItem[] };

/** Sidebar on large screens, a horizontally scrolling tab bar on phones. */
export function AdminNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  const all = groups.flatMap((g) => g.items);

  return (
    <>
      <nav aria-label="Admin" className="-mx-4 overflow-x-auto border-b border-line px-4 lg:hidden">
        <ul className="flex gap-1 py-2">
          {all.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-control px-3 text-sm font-semibold whitespace-nowrap",
                  isActive(item.href) ? "bg-brand-soft text-brand-ink" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Admin" className="hidden lg:block">
        {groups.map((group) => (
          <div key={group.label} className="mb-6">
            <p className="mb-1 px-3 text-sm font-semibold text-ink-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    className={cn(
                      "flex h-10 items-center rounded-control px-3 text-sm font-semibold",
                      isActive(item.href) ? "bg-brand-soft text-brand-ink" : "text-ink hover:bg-surface-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
