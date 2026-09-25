import "server-only";

// One interface for every payment provider. The rest of the app never talks to PayMongo
// or Stripe directly: it asks the configured provider for a checkout URL, and hands
// webhook requests (raw body + headers) back to that provider to verify and normalize.

export type ProviderId = "PAYMONGO" | "STRIPE";

export type CheckoutRequest = {
  bookingId: string;
  referenceCode: string;
  /** What the customer sees on the checkout page, e.g. "Overnight at Main Pool Villa". */
  description: string;
  /** Decimal string in the booking currency, e.g. "7500.00". */
  amount: string;
  currency: string;
  customerName: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** When our hold ends. Providers that can expire sessions use it (within their limits). */
  expiresAt: Date;
};

export type CheckoutSession = { provider: ProviderId; sessionId: string; url: string };

/** A verified webhook, normalized. Amounts are decimal strings in `currency`. */
export type PaymentEvent =
  | {
      kind: "paid";
      provider: ProviderId;
      eventId: string;
      sessionId: string;
      paymentRef: string | null;
      amount: string;
      currency: string;
      method: string;
      /** Minimal, non-personal record of the event for the audit trail. */
      raw: Record<string, unknown>;
    }
  | { kind: "ignored"; provider: ProviderId; eventId: string; type: string };

export interface PaymentProvider {
  readonly id: ProviderId;
  /** Currencies this provider can charge in (null = any). */
  readonly currencies: readonly string[] | null;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Throws WebhookSignatureError unless the request is authentic and fresh. */
  verifyWebhook(rawBody: string, headers: Headers, now?: Date): PaymentEvent;
}

/** The request didn't come from the provider (bad/missing/stale signature, or malformed). */
export class WebhookSignatureError extends Error {
  override name = "WebhookSignatureError";
}

/** The provider rejected or failed a request we made. `message` is safe to log, not to show. */
export class PaymentProviderError extends Error {
  override name = "PaymentProviderError";
}

/** Signatures older than this are rejected, so a captured request can't be replayed later. */
export const WEBHOOK_TOLERANCE_SEC = 5 * 60;
