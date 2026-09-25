import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
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

// PayMongo (Philippines): Checkout Sessions with GCash, Maya and cards. No official SDK,
// so this is plain fetch against the REST API.
//
// Webhook signature — header `Paymongo-Signature: t=<unix>,te=<hex>,li=<hex>`:
//   HMAC-SHA256(webhook secret, `${t}.${rawBody}`) as hex, compared with `te` for test
//   keys and `li` for live keys.

const API = "https://api.paymongo.com/v1";
const METHODS = ["gcash", "paymaya", "card"] as const;

const paidEventSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      type: z.string(),
      livemode: z.boolean().optional(),
      data: z
        .object({
          id: z.string(),
          attributes: z
            .object({
              payment_method_used: z.string().nullish(),
              payments: z
                .array(
                  z.object({
                    id: z.string(),
                    attributes: z.object({
                      amount: z.number().int(),
                      currency: z.string(),
                      status: z.string(),
                      source: z.object({ type: z.string() }).nullish(),
                    }),
                  }),
                )
                .default([]),
            })
            .passthrough(),
        })
        .passthrough()
        .optional(),
    }),
  }),
});

export function paymongoSignature(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export class PayMongoProvider implements PaymentProvider {
  readonly id = "PAYMONGO" as const;
  readonly currencies = ["PHP"] as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private get live(): boolean {
    return this.secretKey.startsWith("sk_live_");
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (request.currency !== "PHP") throw new PaymentProviderError("PayMongo only charges in PHP");
    const response = await this.fetchImpl(`${API}/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `Deposit for ${request.referenceCode}`,
                description: request.description.slice(0, 255),
                amount: toMinorUnits(request.amount, "PHP"),
                currency: "PHP",
                quantity: 1,
              },
            ],
            payment_method_types: METHODS,
            description: request.description.slice(0, 255),
            reference_number: request.referenceCode,
            success_url: request.successUrl,
            cancel_url: request.cancelUrl,
            send_email_receipt: true,
            show_line_items: true,
            billing: { name: request.customerName, email: request.customerEmail },
            // Lets support staff match a PayMongo payment to a booking without our database.
            metadata: { booking_id: request.bookingId, reference: request.referenceCode },
          },
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new PaymentProviderError(`PayMongo checkout failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    const body = (await response.json()) as { data?: { id?: string; attributes?: { checkout_url?: string } } };
    const sessionId = body.data?.id;
    const url = body.data?.attributes?.checkout_url;
    if (!sessionId || !url) throw new PaymentProviderError("PayMongo checkout response had no id or URL");
    return { provider: this.id, sessionId, url };
  }

  verifyWebhook(rawBody: string, headers: Headers, now = new Date()): PaymentEvent {
    const header = headers.get("paymongo-signature");
    if (!header) throw new WebhookSignatureError("Missing Paymongo-Signature header");
    const parts = Object.fromEntries(
      header.split(",").map((part) => {
        const [key, ...value] = part.trim().split("=");
        return [key, value.join("=")];
      }),
    ) as Record<string, string | undefined>;
    const timestamp = parts.t;
    const presented = this.live ? parts.li : parts.te;
    if (!timestamp || !/^\d+$/.test(timestamp) || !presented) throw new WebhookSignatureError("Malformed signature header");
    if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SEC) {
      throw new WebhookSignatureError("Signature timestamp outside tolerance");
    }
    if (!safeEqualHex(paymongoSignature(this.webhookSecret, timestamp, rawBody), presented)) {
      throw new WebhookSignatureError("Signature mismatch");
    }

    let parsed: z.infer<typeof paidEventSchema>;
    try {
      parsed = paidEventSchema.parse(JSON.parse(rawBody));
    } catch {
      throw new WebhookSignatureError("Signed body is not a PayMongo event");
    }
    const event = parsed.data;
    const type = event.attributes.type;
    const session = event.attributes.data;
    if (type !== "checkout_session.payment.paid" || !session) return { kind: "ignored", provider: this.id, eventId: event.id, type };

    const payment = session.attributes.payments.find((p) => p.attributes.status === "paid") ?? session.attributes.payments[0];
    if (!payment) return { kind: "ignored", provider: this.id, eventId: event.id, type: `${type} (no payment)` };
    const currency = payment.attributes.currency.toUpperCase();
    const method = session.attributes.payment_method_used ?? payment.attributes.source?.type ?? "unknown";
    return {
      kind: "paid",
      provider: this.id,
      eventId: event.id,
      sessionId: session.id,
      paymentRef: payment.id,
      amount: toAmountString(fromMinorUnits(payment.attributes.amount, currency), currency),
      currency,
      method: method === "paymaya" ? "maya" : method,
      raw: { type, livemode: event.attributes.livemode ?? null, session: session.id, payment: payment.id, method },
    };
  }
}
