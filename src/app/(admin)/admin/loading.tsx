// Admin pages query the database on every visit; show the shape while they load.
export default function AdminLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading…</p>
      <div className="h-8 w-48 animate-pulse rounded bg-surface-muted" aria-hidden="true" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card border border-line bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-card border border-line bg-surface" aria-hidden="true" />
    </div>
  );
}
