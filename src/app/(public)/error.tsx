"use client";

import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui";

// Public pages keep the site header and footer around this. Never shows error.message.
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-extrabold">Something went wrong on our side</h1>
      <p className="text-ink-muted">
        Nothing was charged. Try again, or come back in a few minutes. If it keeps happening, contact us and mention{" "}
        <span className="font-semibold text-ink tabular-nums">{error.digest ?? "this page"}</span>.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className={buttonStyles({ variant: "secondary" })}>
          Home
        </Link>
      </div>
    </main>
  );
}
