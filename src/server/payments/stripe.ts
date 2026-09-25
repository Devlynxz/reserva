import "server-only";
import Stripe from "stripe";
import { fromMinorUnits, toAmountString, toMinorUnits } from "@/lib/money";
import {
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentProvider,
  PaymentProviderError,
  WEBHOOK_TOLERANCE_SEC,
  WebhookSignatureError,
} from "./provider";

// Stripe (international clients): Checkout Sessions via the official SDK. Signature
// verification is the SDK's constructEvent over the raw body.

/** Stripe won't expire a Checkout Session sooner than 30 minutes after creation. */
const MIN_SESSION_MINUTES = 31;

export class StripeProvider implements PaymentProvider {
  readonly id = "STRIPE" as const;
  readonly currencies = null;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    fetchImpl?: typeof fetch,
  ) {
    this.stripe = new Stripe(secretKey, {
      httpClient: Stripe.createFetchHttpClient(fetchImpl),
      maxNetworkRetries: 1,
      timeout: 15_000,
      appInfo: { name: "Reserva" },
    });
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    // Our hold may be shorter than Stripe's minimum; a payment after the hold is handled
    // by the late-payment path (re-confirm if still free, otherwise flag for refund).
    const earliest = Date.now() + MIN_SESSION_MINUTES * 60_000;
    const expiresAt = Math.ceil(Math.max(request.expiresAt.getTime(), earliest) / 1000);
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: request.currency.toLowerCase(),
              unit_amount: toMinorUnits(request.amount, request.currency),
              product_data: { name: `Deposit for ${request.referenceCode}`, description: request.description.slice(0, 255) },
            },
          },
        ],
        customer_email: request.customerEmail,
        client_reference_id: request.bookingId,
        metadata: { booking_id: request.bookingId, reference: request.referenceCode },
        payment_intent_data: { metadata: { booking_id: request.bookingId, reference: request.referenceCode } },
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        expires_at: expiresAt,
      });
      if (!session.url) throw new PaymentProviderError("Stripe checkout session has no URL");
      return { provider: this.id, sessionId: session.id, url: session.url };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      throw new PaymentProviderError(`Stripe checkout failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  verifyWebhook(rawBody: string, headers: Headers, now = new Date()): PaymentEvent {
    const signature = headers.get("stripe-signature");
    if (!signature) throw new WebhookSignatureError("Missing Stripe-Signature header");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
        WEBHOOK_TOLERANCE_SEC,
        undefined,
        now.getTime(), // milliseconds: Stripe divides by 1000 itself
      );
    } catch {
      throw new WebhookSignatureError("Signature mismatch");
    }

    // Card payments complete immediately; some methods settle later (async_payment_succeeded).
    const paidTypes = ["checkout.session.completed", "checkout.session.async_payment_succeeded"];
    if (!paidTypes.includes(event.type)) return { kind: "ignored", provider: this.id, eventId: event.id, type: event.type };

    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid" || session.amount_total === null || !session.currency) {
      return { kind: "ignored", provider: this.id, eventId: event.id, type: `${event.type} (${session.payment_status})` };
    }
    const currency = session.currency.toUpperCase();
    const paymentRef = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
    const method = session.payment_method_types?.[0] ?? "card";
    return {
      kind: "paid",
      provider: this.id,
      eventId: event.id,
      sessionId: session.id,
      paymentRef,
      amount: toAmountString(fromMinorUnits(session.amount_total, currency), currency),
      currency,
      method,
      raw: { type: event.type, livemode: event.livemode, session: session.id, payment: paymentRef, method },
    };
  }
}
