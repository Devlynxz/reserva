"use client";

import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui";

// Inside the admin shell, so the navigation stays usable when one page fails.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-lg space-y-4 rounded-card border border-danger/30 bg-surface p-6">
      <h1 className="text-xl font-extrabold">This page couldn&apos;t load</h1>
      <p className="text-ink-muted">
        Nothing was changed. Try again; if it keeps failing, the error code{" "}
        <span className="font-semibold text-ink tabular-nums">{error.digest ?? "(none)"}</span> helps whoever maintains the site find it in the
        logs.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/admin" className={buttonStyles({ variant: "secondary" })}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
