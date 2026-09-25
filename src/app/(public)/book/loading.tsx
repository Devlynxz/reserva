// Shown while the booking page loads packages and settings.
export default function BookLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 sm:pt-10" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading packages…</p>
      <div className="mb-8 flex items-center gap-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <div className="size-8 animate-pulse rounded-full bg-surface-muted" />
            {i < 3 && <div className="h-0.5 flex-1 bg-line" />}
          </div>
        ))}
      </div>
      <div className="h-8 w-56 animate-pulse rounded bg-surface-muted" aria-hidden="true" />
      <div className="mt-6 space-y-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
