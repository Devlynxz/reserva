import "server-only";
import { env } from "./env";

/**
 * The public origin for links we hand out (emails, checkout return URLs). Production uses
 * NEXT_PUBLIC_APP_URL; a Vercel preview deployment uses its own URL, so testing a preview
 * never sends a customer (or a payment provider) to the production site.
 */
export function appUrl(): string {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return env().NEXT_PUBLIC_APP_URL;
}

/** Origins allowed to sign in (Better Auth's CSRF check): the app, plus this deployment's own Vercel URLs. */
export function trustedOrigins(): string[] {
  const { BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL } = env();
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean).map((host) => `https://${host}`);
  return [...new Set([BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL, ...vercel])];
}
