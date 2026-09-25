import "server-only";
import { cookies } from "next/headers";
import { env } from "./env";
import { BOOKING_ACCESS_TTL_SEC, accessTokenMatches, bookingAccessCookieName, signBookingAccess, verifyBookingAccess } from "./tokens";

/** Give this browser access to /book/<ref> for an hour (lookup, or on the way to checkout). */
export async function grantBookingAccess(referenceCode: string): Promise<void> {
  const { BETTER_AUTH_SECRET, NODE_ENV } = env();
  const expiresAt = Date.now() + BOOKING_ACCESS_TTL_SEC * 1000;
  (await cookies()).set(bookingAccessCookieName(referenceCode), signBookingAccess(BETTER_AUTH_SECRET, referenceCode, expiresAt), {
    httpOnly: true,
    secure: NODE_ENV === "production",
    sameSite: "lax", // survives the redirect back from the payment page
    path: `/book/${referenceCode}`,
    maxAge: BOOKING_ACCESS_TTL_SEC,
  });
}

/** Link token (?t=) or signed cookie — the two ways a customer may see a booking. */
export async function canViewBooking(referenceCode: string, accessTokenHash: string, token: string | undefined): Promise<boolean> {
  if (token !== undefined && accessTokenMatches(token, accessTokenHash)) return true;
  const cookie = (await cookies()).get(bookingAccessCookieName(referenceCode))?.value;
  return verifyBookingAccess(env().BETTER_AUTH_SECRET, referenceCode, cookie);
}
