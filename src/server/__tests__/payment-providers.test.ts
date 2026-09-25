import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { PayMongoProvider, paymongoSignature } from "../payments/paymongo";
import { PaymentProviderError, WebhookSignatureError } from "../payments/provider";
import { StripeProvider } from "../payments/stripe";

const NOW = new Date("2030-04-01T00:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);

const checkoutRequest = {
  bookingId: "0196b0c4-7a2e-7cc1-9a5e-2f4b8c1d3e5f",
  referenceCode: "RSV-7K3Q9",
  description: "Overnight at Main Pool Villa",
  amount: "7500.00",
  currency: "PHP",
  customerName: "Maria Santos",
  customerEmail: "maria@example.com",
  successUrl: "https://resort.example/book/RSV-7K3Q9?paid=1",
  cancelUrl: "https://resort.example/book/RSV-7K3Q9",
  expiresAt: new Date(Date.now() + 15 * 60_000),
};

// ─── PayMongo ───────────────────────────────────────────────────────────────

const PM_SECRET = "whsk_test_secret";

function paymongoPaidEvent(overrides: { type?: string; amount?: number; status?: string } = {}) {
  return JSON.stringify({
    data: {
      id: "evt_123",
      type: "event",
      attributes: {
        type: overrides.type ?? "checkout_session.payment.paid",
        livemode: false,
        data: {
          id: "cs_abc",
          type: "checkout_session",
          attributes: {
            payment_method_used: "paymaya",
            billing: { email: "maria@example.com", name: "Maria Santos" },
            payments: [{ id: "pay_789", attributes: { amount: overrides.amount ?? 750000, currency: "PHP", status: overrides.status ?? "paid" } }],
          },
        },
      },
    },
  });
}

function signedPayMongoHeaders(body: string, { secret = PM_SECRET, t = nowSec, field = "te" } = {}) {
  const sig = paymongoSignature(secret, String(t), body);
  return new Headers({ "paymongo-signature": `t=${t},${field === "te" ? `te=${sig},li=` : `te=,li=${sig}`}` });
}

describe("PayMongo webhooks", () => {
  const provider = new PayMongoProvider("sk_test_key", PM_SECRET);

  it("accepts a correctly signed paid event and normalizes it", () => {
    const body = paymongoPaidEvent();
    const event = provider.verifyWebhook(body, signedPayMongoHeaders(body), NOW);
    expect(event).toEqual({
      kind: "paid",
      provider: "PAYMONGO",
      eventId: "evt_123",
      sessionId: "cs_abc",
      paymentRef: "pay_789",
      amount: "7500.00",
      currency: "PHP",
      method: "maya",
      raw: { type: "checkout_session.payment.paid", livemode: false, session: "cs_abc", payment: "pay_789", method: "paymaya" },
    });
    // The stored raw record carries no customer details.
    expect(JSON.stringify((event as { raw: unknown }).raw)).not.toContain("maria");
  });

  it("rejects missing, malformed, tampered, stale or wrongly keyed signatures", () => {
    const body = paymongoPaidEvent();
    const reject = (headers: Headers, rawBody = body) =>
      expect(() => provider.verifyWebhook(rawBody, headers, NOW)).toThrow(WebhookSignatureError);
    reject(new Headers());
    reject(new Headers({ "paymongo-signature": "garbage" }));
    reject(signedPayMongoHeaders(body), body.replace("750000", "1"));
    reject(signedPayMongoHeaders(body, { t: nowSec - 3600 }));
    reject(signedPayMongoHeaders(body, { secret: "whsk_other" }));
    // A test-mode key only trusts the `te` signature, never `li`.
    reject(signedPayMongoHeaders(body, { field: "li" }));
  });

  it("uses the live signature with a live key", () => {
    const live = new PayMongoProvider("sk_live_key", PM_SECRET);
    const body = paymongoPaidEvent();
    expect(live.verifyWebhook(body, signedPayMongoHeaders(body, { field: "li" }), NOW).kind).toBe("paid");
    expect(() => live.verifyWebhook(body, signedPayMongoHeaders(body, { field: "te" }), NOW)).toThrow(WebhookSignatureError);
  });

  it("ignores other event types and rejects signed non-events", () => {
    const body = paymongoPaidEvent({ type: "payment.refunded" });
    expect(provider.verifyWebhook(body, signedPayMongoHeaders(body), NOW)).toMatchObject({ kind: "ignored", type: "payment.refunded" });
    const junk = JSON.stringify({ hello: "world" });
    expect(() => provider.verifyWebhook(junk, signedPayMongoHeaders(junk), NOW)).toThrow(WebhookSignatureError);
  });
});

describe("PayMongo checkout", () => {
  it("creates a PHP checkout for GCash, Maya and cards with the deposit in centavos", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ data: { id: "cs_new", attributes: { checkout_url: "https://checkout.paymongo.com/cs_new" } } }),
    );
    const provider = new PayMongoProvider("sk_test_key", PM_SECRET, fetchMock as unknown as typeof fetch);
    await expect(provider.createCheckout(checkoutRequest)).resolves.toEqual({
      provider: "PAYMONGO",
      sessionId: "cs_new",
      url: "https://checkout.paymongo.com/cs_new",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.paymongo.com/v1/checkout_sessions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("sk_test_key:").toString("base64")}`);
    const attributes = JSON.parse(init.body as string).data.attributes;
    expect(attributes.line_items).toEqual([expect.objectContaining({ amount: 750000, currency: "PHP", quantity: 1 })]);
    expect(attributes.payment_method_types).toEqual(["gcash", "paymaya", "card"]);
    expect(attributes).toMatchObject({ reference_number: "RSV-7K3Q9", success_url: checkoutRequest.successUrl, cancel_url: checkoutRequest.cancelUrl });
  });

  it("refuses non-PHP amounts and surfaces API errors", async () => {
    const failing = vi.fn(async () => new Response("{\"errors\":[]}", { status: 401 }));
    const provider = new PayMongoProvider("sk_test_key", PM_SECRET, failing as unknown as typeof fetch);
    await expect(provider.createCheckout({ ...checkoutRequest, currency: "USD" })).rejects.toThrow(/only charges in PHP/);
    await expect(provider.createCheckout(checkoutRequest)).rejects.toBeInstanceOf(PaymentProviderError);
    const empty = new PayMongoProvider("sk_test_key", PM_SECRET, (async () => Response.json({ data: {} })) as unknown as typeof fetch);
    await expect(empty.createCheckout(checkoutRequest)).rejects.toThrow(/no id or URL/);
  });
});

// ─── Stripe ─────────────────────────────────────────────────────────────────

const STRIPE_SECRET = "whsec_test_secret";
const stripeHelpers = new Stripe("sk_test_helper");

function stripeEvent(type: string, session: Partial<Stripe.Checkout.Session>) {
  return JSON.stringify({
    id: "evt_stripe_1",
    object: "event",
    type,
    livemode: false,
    created: nowSec,
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 12345,
        currency: "usd",
        payment_intent: "pi_1",
        payment_method_types: ["card"],
        customer_details: { email: "maria@example.com" },
        ...session,
      },
    },
  });
}

function signedStripeHeaders(payload: string, secret = STRIPE_SECRET, timestamp = nowSec) {
  return new Headers({ "stripe-signature": stripeHelpers.webhooks.generateTestHeaderString({ payload, secret, timestamp }) });
}

describe("Stripe webhooks", () => {
  const provider = new StripeProvider("sk_test_key", STRIPE_SECRET);

  it("accepts a signed completed checkout and normalizes it", () => {
    const body = stripeEvent("checkout.session.completed", {});
    expect(provider.verifyWebhook(body, signedStripeHeaders(body), NOW)).toEqual({
      kind: "paid",
      provider: "STRIPE",
      eventId: "evt_stripe_1",
      sessionId: "cs_test_1",
      paymentRef: "pi_1",
      amount: "123.45",
      currency: "USD",
      method: "card",
      raw: { type: "checkout.session.completed", livemode: false, session: "cs_test_1", payment: "pi_1", method: "card" },
    });
  });

  it("rejects bad, stale or missing signatures", () => {
    const body = stripeEvent("checkout.session.completed", {});
    expect(() => provider.verifyWebhook(body, signedStripeHeaders(body, "whsec_other"), NOW)).toThrow(WebhookSignatureError);
    expect(() => provider.verifyWebhook(body, signedStripeHeaders(body, STRIPE_SECRET, nowSec - 3600), NOW)).toThrow(
      WebhookSignatureError,
    );
    expect(() => provider.verifyWebhook(body.replace("12345", "1"), signedStripeHeaders(body), NOW)).toThrow(WebhookSignatureError);
    expect(() => provider.verifyWebhook(body, new Headers(), NOW)).toThrow(WebhookSignatureError);
  });

  it("ignores unpaid sessions and unrelated events", () => {
    const unpaid = stripeEvent("checkout.session.completed", { payment_status: "unpaid" });
    expect(provider.verifyWebhook(unpaid, signedStripeHeaders(unpaid), NOW).kind).toBe("ignored");
    const other = stripeEvent("charge.refunded", {});
    expect(provider.verifyWebhook(other, signedStripeHeaders(other), NOW)).toMatchObject({ kind: "ignored", type: "charge.refunded" });
    const async = stripeEvent("checkout.session.async_payment_succeeded", { payment_intent: { id: "pi_obj" } as Stripe.PaymentIntent });
    expect(provider.verifyWebhook(async, signedStripeHeaders(async), NOW)).toMatchObject({ kind: "paid", paymentRef: "pi_obj" });
  });
});

describe("Stripe checkout", () => {
  it("creates a session no shorter than Stripe's 30-minute minimum", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "cs_test_new", object: "checkout.session", url: "https://checkout.stripe.com/c/pay/cs_test_new" }),
    );
    const provider = new StripeProvider("sk_test_key", STRIPE_SECRET, fetchMock as unknown as typeof fetch);
    const before = Math.floor(Date.now() / 1000);
    await expect(provider.createCheckout({ ...checkoutRequest, currency: "USD", amount: "123.45" })).resolves.toEqual({
      provider: "STRIPE",
      sessionId: "cs_test_new",
      url: "https://checkout.stripe.com/c/pay/cs_test_new",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const form = new URLSearchParams(init.body as string);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("12345");
    expect(form.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(form.get("client_reference_id")).toBe(checkoutRequest.bookingId);
    expect(Number(form.get("expires_at"))).toBeGreaterThanOrEqual(before + 30 * 60);
  });

  it("wraps API errors", async () => {
    const failing = vi.fn(async () => Response.json({ error: { message: "Invalid API Key", type: "invalid_request_error" } }, { status: 401 }));
    const provider = new StripeProvider("sk_test_key", STRIPE_SECRET, failing as unknown as typeof fetch);
    await expect(provider.createCheckout(checkoutRequest)).rejects.toBeInstanceOf(PaymentProviderError);
  });
});
