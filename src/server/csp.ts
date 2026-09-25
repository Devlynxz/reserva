// Content-Security-Policy with a per-request nonce (built in src/proxy.ts).
// Scripts: only nonce'd ones, plus what they load ('strict-dynamic') — no inline handlers,
// no third-party script hosts. Styles: nonce'd <style>/<link> only; style *attributes* are
// allowed because React/next/image emit them and they can't execute code.
// Checkout redirects are plain navigations (window.location), which CSP doesn't restrict,
// so form-action can stay 'self'.

export type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** Extra origins for img-src, e.g. the Vercel Blob store. */
  imageOrigins?: readonly string[];
  /** Extra origins for connect-src, e.g. the Sentry ingest host. */
  connectOrigins?: readonly string[];
};

/** Admin-uploaded logos and photos live on Vercel Blob. */
export const BLOB_ORIGIN = "https://*.public.blob.vercel-storage.com";

export function buildCsp({ nonce, isDev, imageOrigins = [], connectOrigins = [] }: CspOptions): string {
  const directives: Record<string, readonly string[]> = {
    "default-src": ["'self'"],
    // React needs eval in dev only (error overlays / stack reconstruction).
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    // Dev injects CSS as un-nonced <style> tags for HMR. A nonce disables 'unsafe-inline',
    // so dev uses 'unsafe-inline' alone; production keeps the nonce.
    "style-src": isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", ...imageOrigins],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...connectOrigins, ...(isDev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}

/** 128 bits from the platform CSPRNG, base64-encoded. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** The origin a Sentry DSN reports to (for connect-src), or null for no/invalid DSN. */
export function sentryOrigin(dsn: string | undefined): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Header name for the policy. `CSP_MODE=report-only` lets a new deployment observe
 * violations in the browser console without breaking anything, like KitaFlux.
 */
export function cspHeaderName(mode: string | undefined): "Content-Security-Policy" | "Content-Security-Policy-Report-Only" {
  return mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
}
