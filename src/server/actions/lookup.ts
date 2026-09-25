"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { lookupSchema } from "@/lib/validation";
import { bookingMatchesEmail } from "../data/public";
import { env } from "../env";
import { rateLimit, tooManyRequestsMessage } from "../rate-limit";
import { clientIp } from "../request";
import { BOOKING_ACCESS_TTL_SEC, bookingAccessCookieName, signBookingAccess } from "../tokens";

export type LookupState = { error?: string; fieldErrors?: { reference?: string; email?: string } };

const NOT_FOUND = "We couldn't find a booking with that reference and email. Check both and try again.";

/**
 * Reference + email → a short-lived signed cookie for /book/<ref>, then redirect there.
 * Rate-limited per IP and per reference; one message for every miss, so it can't be
 * used to learn which references or emails exist.
 */
export async function lookupAction(_previous: LookupState, formData: FormData): Promise<LookupState> {
  const parsed = lookupSchema.safeParse({ reference: formData.get("reference") ?? "", email: formData.get("email") ?? "" });
  if (!parsed.success) {
    const fieldErrors: LookupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "reference" | "email";
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors };
  }
  const { reference, email } = parsed.data;

  for (const [name, key] of [
    ["lookup", await clientIp()],
    ["lookupPerReference", reference],
  ] as const) {
    const limit = await rateLimit(name, key);
    if (!limit.allowed) return { error: tooManyRequestsMessage(limit.retryAfterSec) };
  }

  if (!(await bookingMatchesEmail(reference, email))) return { error: NOT_FOUND };

  const expiresAt = Date.now() + BOOKING_ACCESS_TTL_SEC * 1000;
  (await cookies()).set(bookingAccessCookieName(reference), signBookingAccess(env().BETTER_AUTH_SECRET, reference, expiresAt), {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: `/book/${reference}`,
    maxAge: BOOKING_ACCESS_TTL_SEC,
  });
  redirect(`/book/${reference}`);
}
