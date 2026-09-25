# Payments, email and background jobs

How deposits get paid and bookings get confirmed, and how to set each piece up. Everything here is optional: without keys, Reserva still takes bookings and tells customers to contact the business to pay.

## How a payment flows

1. The customer reviews their booking and presses **Continue to payment**. The server creates the booking as `PENDING_PAYMENT` with a hold (`Settings.holdMinutes`), then opens a Checkout Session with the active provider (`PAYMENT_PROVIDER`) and redirects to it.
2. The customer pays on the provider's page (GCash, Maya or card on PayMongo; card and other methods on Stripe) and is sent back to `/book/<ref>?paid=1`. That page **only reads** the status. It says "confirming your payment" and refreshes itself.
3. The provider calls `POST /api/webhooks/<provider>`. That route is the **only** thing that confirms an online payment:
   - verifies the signature over the raw body and rejects anything older than 5 minutes (replay protection);
   - records a `Payment`, deduplicated by the provider's event id (unique index) and payment id, so a redelivered or duplicated event changes nothing;
   - checks amount and currency against the booking's deposit — a mismatch is recorded but **not** confirmed;
   - confirms through the state machine (`PENDING_PAYMENT → CONFIRMED`). A payment that arrives after the hold expired re-confirms the booking if the slot is still free; otherwise the money is recorded and the booking is flagged "Refund needed" in its internal notes;
   - responds 2xx, then sends the confirmation email.

If the provider can't create a session, the new booking is cancelled at once so the slot isn't held for nobody. The **Pay deposit** button on the booking page reuses the booking's open session instead of creating a second one.

## Choosing a provider

| | PayMongo | Stripe |
|---|---|---|
| For | Philippine businesses | International businesses |
| Currency | PHP only (Reserva refuses other currencies) | Any Stripe-supported currency with ≤ 2 decimals |
| Methods | GCash, Maya, cards | Cards (and whatever you enable in the Stripe dashboard) |
| Hold length | 15 minutes works | Use ≥ 30 minutes: Stripe won't expire a session sooner, so shorter holds rely on the late-payment path |

Set in the environment:

```bash
PAYMENT_PROVIDER=paymongo   # or stripe, or none
PAYMONGO_SECRET_KEY=sk_test_...
PAYMONGO_WEBHOOK_SECRET=whsk_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

A provider's webhook keeps working whenever its keys are set, even after you switch `PAYMENT_PROVIDER`, so payments for sessions opened before the switch still land.

## Registering the webhooks

### PayMongo

PayMongo webhooks are created through the API. Use the **test** secret key while testing.

```bash
curl -X POST https://api.paymongo.com/v1/webhooks \
  -u "sk_test_YOUR_KEY:" \
  -H "Content-Type: application/json" \
  -d '{"data":{"attributes":{"url":"https://YOUR_DOMAIN/api/webhooks/paymongo","events":["checkout_session.payment.paid"]}}}'
```

The response contains the webhook's `secret_key` (`whsk_...`). Put it in `PAYMONGO_WEBHOOK_SECRET`. Test-mode events are signed in the `te=` part of the `Paymongo-Signature` header and live ones in `li=`; Reserva picks the right one from whether your secret key starts with `sk_test_` or `sk_live_`.

When a client goes live, register a second webhook with the **live** key and swap both keys.

### Stripe

In the Stripe dashboard: **Developers → Webhooks → Add endpoint**

- URL: `https://YOUR_DOMAIN/api/webhooks/stripe`
- Events: `checkout.session.completed` and `checkout.session.async_payment_succeeded`

Copy the endpoint's signing secret (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.

## Testing locally

Run the app with `npm run dev` and a database (see the README).

### Stripe (easiest)

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run `stripe login`.
2. Forward events to your machine. The CLI prints a `whsec_...` secret — use it as `STRIPE_WEBHOOK_SECRET` locally:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe --events checkout.session.completed,checkout.session.async_payment_succeeded
   ```
3. Set `PAYMENT_PROVIDER=stripe` and your **test** `STRIPE_SECRET_KEY`, and set the business currency to one Stripe supports (Settings). Book something, pay with card `4242 4242 4242 4242`, any future expiry, any CVC. The booking page flips to Confirmed within seconds.

`stripe trigger checkout.session.completed` also works, but its session isn't one of your bookings, so the webhook answers `unknown_session` — useful only to see the signature check pass.

### PayMongo

PayMongo has to reach your machine over HTTPS, so use a tunnel:

1. Start one, e.g. `npx cloudflared tunnel --url http://localhost:3000` (or ngrok). Note the `https://…` URL.
2. Register a **test** webhook pointing at `https://<tunnel>/api/webhooks/paymongo` (see above) and put its `secret_key` in `PAYMONGO_WEBHOOK_SECRET`.
3. Set `PAYMENT_PROVIDER=paymongo` and your `sk_test_...` key, and set `NEXT_PUBLIC_APP_URL` to the tunnel URL so PayMongo sends the customer back to it.
4. Book something and choose GCash or Maya: PayMongo's test page lets you **Authorize** or **Fail** the payment. For cards, use PayMongo's test card numbers.

> **Check once:** PayMongo's signature scheme is implemented as `HMAC-SHA256(secret, "<t>.<raw body>")` compared with the `te`/`li` value. If the first real test webhook is rejected, the server log says why (`[webhook PAYMONGO] rejected: …`).

### Without any provider

With `PAYMENT_PROVIDER=none`, bookings are held and the booking page asks the customer to contact the business. Staff record the payment in the admin (Phase 6).

## Email (Resend)

Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend, e.g. `Villa Serena <bookings@villaserena.ph>`). Without them, emails are skipped with a log line and nothing else changes.

| Email | Sent when |
|---|---|
| Booking received | An online booking is created and awaits its deposit. Includes the booking link. |
| Booking confirmed | The webhook confirms payment. |
| Reminder | 09:00 business time, the day before a confirmed booking. |
| Cancelled | Staff cancel a booking (Phase 6). |

Every email links to the customer's booking page. Links carry a token derived from the booking id with `BETTER_AUTH_SECRET`, so they keep working for the life of the booking; rotating that secret invalidates old links (customers can still use **Find my booking**).

## Background jobs (Inngest)

Add Inngest from the Vercel Marketplace; it sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` and discovers the functions at `/api/inngest`.

| Function | Schedule | Why |
|---|---|---|
| `sweep-expired-holds` | every 5 minutes | Backstop: holds also expire lazily whenever someone books the same resource. |
| `send-booking-reminders` | hourly | Sends only when it's 09:00 in the business's timezone (read from Settings each run). Each booking's reminder is claimed atomically, so it's never sent twice. |
| `prune-rate-limits` | daily | Deletes old rate-limit windows. |

Locally: `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` opens the Inngest dev server, where you can trigger each function by hand.
