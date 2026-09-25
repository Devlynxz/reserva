import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { BLOB_ORIGIN, buildCsp, createNonce, cspHeaderName, sentryOrigin } from "@/server/csp";

// Runs before every page request: sets the CSP nonce and security headers, and bounces
// signed-out visitors away from /admin early. The /admin check is a UX shortcut only — it
// checks that a session cookie EXISTS, not that it's valid. Real authorization happens in
// src/server/session.ts, on every page, action and route.
//
// Reads process.env directly (not the validated env()): a missing optional variable must
// never take the whole site down at this layer.

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/admin") && !getSessionCookie(request)) {
    const signIn = new URL("/sign-in", request.url);
    signIn.searchParams.set("next", pathname + search);
    return NextResponse.redirect(signIn);
  }

  const isDev = process.env.NODE_ENV === "development";
  const nonce = createNonce();
  const sentry = sentryOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const csp = buildCsp({ nonce, isDev, imageOrigins: [BLOB_ORIGIN], connectOrigins: sentry ? [sentry] : [] });
  const header = cspHeaderName(process.env.CSP_MODE);

  // Next.js reads the nonce from the request's CSP header and applies it to its own scripts
  // (it needs the enforcing header name even in report-only mode).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(header, csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!isDev) response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: skip API routes, static assets and link prefetches.
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
