import "server-only";
import { isHoldExpired } from "@/lib/booking-status";
import { transitionBooking } from "./data/bookings";
import { attachCheckout, getBookingForCheckout } from "./data/payments";
import { appUrl } from "./app-url";
import { PaymentProviderError, getCheckoutProvider } from "./payments";

export type CheckoutResult =
  | { status: "redirect"; url: string }
  | { status: "payments_off" }
  | { status: "not_payable" }
  | { status: "failed"; message: string };

/**
 * Send a pending booking to the payment provider. Reuses the booking's open session while
 * its hold lasts (a second session could be paid twice); otherwise creates one and stores
 * its id — webhooks find the booking by that id.
 *
 * `cancelOnFailure`: for a brand-new booking, a provider error releases the slot right
 * away instead of leaving a hold nobody can pay.
 */
export async function openCheckout(bookingId: string, options: { cancelOnFailure?: boolean; now?: Date } = {}): Promise<CheckoutResult> {
  const provider = getCheckoutProvider();
  if (!provider) return { status: "payments_off" };

  const now = options.now ?? new Date();
  const booking = await getBookingForCheckout({ id: bookingId });
  if (!booking || booking.status !== "PENDING_PAYMENT" || !booking.holdExpiresAt || isHoldExpired(booking, now)) {
    return { status: "not_payable" };
  }
  if (booking.checkoutUrl && booking.paymentProvider === provider.id) return { status: "redirect", url: booking.checkoutUrl };

  try {
    if (provider.currencies && !provider.currencies.includes(booking.currency)) {
      throw new PaymentProviderError(`${provider.id} can't charge ${booking.currency}; change the business currency or the provider`);
    }
    const base = appUrl();
    const session = await provider.createCheckout({
      bookingId: booking.id,
      referenceCode: booking.referenceCode,
      description: `${booking.offeringName} at ${booking.resourceName}`,
      amount: booking.depositAmount,
      currency: booking.currency,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      // No token in these URLs: the customer carries a signed access cookie instead, so the
      // provider never holds a working link to the booking.
      successUrl: `${base}/book/${booking.referenceCode}?paid=1`,
      cancelUrl: `${base}/book/${booking.referenceCode}`,
      expiresAt: booking.holdExpiresAt,
    });
    return { status: "redirect", url: await attachCheckout(booking.id, session) };
  } catch (error) {
    console.error("[checkout] could not start:", error);
    if (options.cancelOnFailure) {
      await transitionBooking({ bookingId, to: "CANCELLED", actor: "system", note: "Online payment could not be started" }).catch(
        (cancelError: unknown) => console.error("[checkout] could not release hold:", cancelError),
      );
    }
    return { status: "failed", message: "We couldn't open the payment page. Please try again in a moment." };
  }
}
