"use client";

import { Button } from "@/components/ui";

// Shown when a page throws. Never renders error.message: it can contain internals.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">Something went wrong on our side</h1>
      <p className="text-ink-muted">
        Your booking data is safe. Try again; if it keeps happening, contact us and mention this code:{" "}
        <span className="font-semibold text-ink tabular-nums">{error.digest ?? "unknown"}</span>.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
