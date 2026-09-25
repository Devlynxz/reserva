import "server-only";
import { env } from "../env";
import { PayMongoProvider } from "./paymongo";
import type { PaymentProvider, ProviderId } from "./provider";
import { StripeProvider } from "./stripe";

export * from "./provider";

/**
 * The provider new checkouts use (PAYMENT_PROVIDER), or null when online payment is off.
 * With null, online bookings still hold their slot and the booking page tells the
 * customer how to pay — nothing crashes for a client that hasn't set up payments yet.
 */
export function getCheckoutProvider(): PaymentProvider | null {
  const e = env();
  if (e.PAYMENT_PROVIDER === "paymongo") return new PayMongoProvider(e.PAYMONGO_SECRET_KEY!, e.PAYMONGO_WEBHOOK_SECRET!);
  if (e.PAYMENT_PROVIDER === "stripe") return new StripeProvider(e.STRIPE_SECRET_KEY!, e.STRIPE_WEBHOOK_SECRET!);
  return null;
}

/**
 * The provider that owns /api/webhooks/<slug>. A provider's webhook works whenever its
 * keys are set — even after switching PAYMENT_PROVIDER — so late events for sessions
 * created before the switch are still honoured. Unknown or unconfigured slug → null (404).
 */
export function getWebhookProvider(slug: string): PaymentProvider | null {
  const e = env();
  if (slug === "paymongo" && e.PAYMONGO_SECRET_KEY && e.PAYMONGO_WEBHOOK_SECRET) {
    return new PayMongoProvider(e.PAYMONGO_SECRET_KEY, e.PAYMONGO_WEBHOOK_SECRET);
  }
  if (slug === "stripe" && e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET) {
    return new StripeProvider(e.STRIPE_SECRET_KEY, e.STRIPE_WEBHOOK_SECRET);
  }
  return null;
}

export type { ProviderId };
