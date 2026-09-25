// Browser error reporting, only when NEXT_PUBLIC_SENTRY_DSN is set. The SDK is imported
// on demand, so sites without Sentry don't download it. Same scrubbing as the server.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/scrub")]).then(([Sentry, { scrubEvent, SENTRY_DATA_COLLECTION }]) => {
    Sentry.init({
      dsn,
      dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
      tracesSampleRate: 0,
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb),
    });
  });
}
