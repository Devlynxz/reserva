import { type NextRequest, NextResponse } from "next/server";
import { afterResponse } from "@/server/after-response";
import { recordProviderPayment } from "@/server/data/payments";
import { notifyBookingConfirmed } from "@/server/notifications";
import { WebhookSignatureError, getWebhookProvider } from "@/server/payments";

// POST /api/webhooks/paymongo | /api/webhooks/stripe
//
// The ONLY place online payments confirm bookings. Order matters:
//  1. read the RAW body (signatures are over the exact bytes; parsing first would break them)
//  2. verify signature + timestamp with the provider's webhook secret → 400 if not authentic
//  3. record idempotently (unique provider_event_id) and confirm through the state machine
//  4. answer 2xx quickly; the confirmation email goes out after the response
// A 5xx makes the provider retry, which is safe because step 3 is idempotent.

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const provider = getWebhookProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let event;
  try {
    event = provider.verifyWebhook(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      console.warn(`[webhook ${provider.id}] rejected: ${error.message}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    throw error;
  }

  if (event.kind === "ignored") return NextResponse.json({ received: true, handled: false });

  const { outcome, bookingId } = await recordProviderPayment(event);
  if (outcome !== "confirmed" && outcome !== "duplicate") {
    console.warn(`[webhook ${provider.id}] event ${event.eventId}: ${outcome}${bookingId ? ` (booking ${bookingId})` : ""}`);
  }
  if (outcome === "confirmed" && bookingId) afterResponse(() => notifyBookingConfirmed(bookingId));
  return NextResponse.json({ received: true, outcome });
}
