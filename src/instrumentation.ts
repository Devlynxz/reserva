import type { Instrumentation } from "next";

// Sentry is optional: nothing is loaded or sent unless SENTRY_DSN is set. Every event
// and breadcrumb is scrubbed of personal data first (src/lib/scrub.ts), and Sentry's own
// PII collection stays off.

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const [Sentry, { scrubEvent, SENTRY_DATA_COLLECTION }] = await Promise.all([import("@sentry/nextjs"), import("@/lib/scrub")]);
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubEvent(breadcrumb),
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
