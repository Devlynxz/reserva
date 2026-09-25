// Content-Security-Policy with a per-request nonce (built in src/proxy.ts).
// Scripts: only nonce'd ones, plus what they load ('strict-dynamic') — no inline handlers,
// no third-party script hosts. Styles: nonce'd <style>/<link> only; style *attributes* are
// allowed because React/next/image emit them and they can't execute code.
// Phase 5 adds the payment providers' checkout origins to form-action (a no-JS form post
// that redirects to checkout counts as a form navigation).

export type CspOptions = {
  nonce: string;
  isDev: boolean;
  /** Extra origins for img-src, e.g. the Vercel Blob store. */
  imageOrigins?: readonly string[];
};

export function buildCsp({ nonce, isDev, imageOrigins = [] }: CspOptions): string {
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
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
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
