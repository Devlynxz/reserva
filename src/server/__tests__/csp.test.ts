import { describe, expect, it } from "vitest";
import { BLOB_ORIGIN, buildCsp, createNonce, cspHeaderName, sentryOrigin } from "../csp";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split("; ").map((part) => {
      const [name = "", ...values] = part.split(" ");
      return [name, values];
    }),
  );
}

describe("buildCsp", () => {
  const prod = directives(buildCsp({ nonce: "abc123", isDev: false }));
  const dev = directives(buildCsp({ nonce: "abc123", isDev: true }));

  it("allows scripts only via nonce + strict-dynamic in production", () => {
    expect(prod.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(prod.get("script-src")).not.toContain("'unsafe-inline'");
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("adds unsafe-eval only in development", () => {
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
  });

  it("nonce-gates <style> in production; allows dev's HMR style tags", () => {
    expect(prod.get("style-src")).toEqual(["'self'", "'nonce-abc123'"]);
    expect(dev.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("locks down framing, plugins, base and form targets", () => {
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });

  it("adds extra image origins", () => {
    const csp = directives(
      buildCsp({ nonce: "n", isDev: false, imageOrigins: ["https://store.public.blob.vercel-storage.com"] }),
    );
    expect(csp.get("img-src")).toContain("https://store.public.blob.vercel-storage.com");
  });
});

describe("createNonce", () => {
  it("is 128-bit base64 and unique per call", () => {
    const nonces = new Set(Array.from({ length: 100 }, createNonce));
    expect(nonces.size).toBe(100);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("sentryOrigin / cspHeaderName", () => {
  it("allows only the HTTPS ingest origin of a DSN", () => {
    expect(sentryOrigin("https://abc123@o42.ingest.us.sentry.io/4507")).toBe("https://o42.ingest.us.sentry.io");
    expect(sentryOrigin("http://abc@insecure.example/1")).toBeNull();
    expect(sentryOrigin("not a url")).toBeNull();
    expect(sentryOrigin(undefined)).toBeNull();
  });

  it("switches to report-only only when asked", () => {
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(undefined)).toBe("Content-Security-Policy");
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
  });

  it("adds connect origins and the Blob store to the policy", () => {
    const csp = buildCsp({ nonce: "n", isDev: false, imageOrigins: [BLOB_ORIGIN], connectOrigins: ["https://o42.ingest.us.sentry.io"] });
    expect(csp).toContain(`img-src 'self' blob: data: ${BLOB_ORIGIN}`);
    expect(csp).toContain("connect-src 'self' https://o42.ingest.us.sentry.io");
  });
});
