# Deploying to Vercel

A step-by-step checklist for putting one client's Reserva on Vercel with Neon. Replace `reserva-villaserena` with the Vercel project name; the production URL is then `https://reserva-villaserena.vercel.app`.

Vercel reads environment variables at build time and at runtime, so **every variable change needs a redeploy** (Deployments → ⋯ → Redeploy).

## How the build works

Vercel runs `npm run vercel-build` (it takes precedence over `build`), which is [`scripts/vercel-build.mjs`](../scripts/vercel-build.mjs):

1. `prisma generate` (the client is generated, not committed);
2. on **production** deployments only: `prisma migrate deploy` against the **direct** Neon URL (`DATABASE_URL_UNPOOLED`, via `prisma.config.ts`) — migrations never go through the pooler, and code never ships ahead of its schema;
3. `next build`.

Preview deployments skip migrations unless `MIGRATE_ON_PREVIEW=true`. Set that only if previews get their own Neon branch; if previews share production's database, leave it unset so a preview can never migrate production.

## Environment variables

| Variable | Set by | Needed | Production value |
|---|---|---|---|
| `DATABASE_URL` | Neon integration | **yes** | pooled connection string (automatic) |
| `DATABASE_URL_UNPOOLED` | Neon integration | **yes** | direct connection string (automatic; used for migrations) |
| `BETTER_AUTH_SECRET` | you | **yes** | `openssl rand -base64 32` — never reuse between clients |
| `BETTER_AUTH_URL` | you | **yes** | `https://reserva-villaserena.vercel.app` (later the custom domain) |
| `NEXT_PUBLIC_APP_URL` | you | **yes** | same as `BETTER_AUTH_URL` |
| `PAYMENT_PROVIDER` | you | optional | `paymongo`, `stripe`, or `none` (default) |
| `PAYMONGO_SECRET_KEY` | you | with PayMongo | `sk_test_…` until go-live, then `sk_live_…` |
| `PAYMONGO_WEBHOOK_SECRET` | you | with PayMongo | `whsk_…` from registering the webhook (step 7) |
| `STRIPE_SECRET_KEY` | you | with Stripe | `sk_test_…` / `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | you | with Stripe | `whsec_…` from the webhook endpoint (step 7) |
| `RESEND_API_KEY` | you | optional | `re_…` |
| `EMAIL_FROM` | you | with Resend | `Villa Serena <bookings@villaserena.ph>` (a verified domain) |
| `INNGEST_EVENT_KEY` | Inngest integration | optional | automatic |
| `INNGEST_SIGNING_KEY` | Inngest integration | optional | automatic |
| `BLOB_READ_WRITE_TOKEN` | Blob store | optional | automatic when the store is connected |
| `SENTRY_DSN` | you | optional | server DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | you | optional | browser DSN (can be the same) |
| `CLIENT_IP_HEADER` | you | optional | leave unset (`x-real-ip` is correct on Vercel) |
| `CSP_MODE` | you | optional | leave unset (`enforce`); `report-only` only while debugging |
| `DEMO_MODE` | you | optional | **leave unset** on client sites; `true` only for the public demo |
| `MIGRATE_ON_PREVIEW` | you | optional | `true` only with Neon preview branches (see above) |

`VERCEL_ENV`, `VERCEL_URL` and `VERCEL_BRANCH_URL` are provided by Vercel: previews use their own URL for sign-in and for links in emails and checkout, so testing a preview never sends anyone to production.

Never set on Vercel: `TEST_DATABASE_URL` (tests truncate it) and the `SEED_*` variables (seeding runs from your machine, step 6).

## Checklist

### 1. Project
- [ ] Push the repository to GitHub.
- [ ] Vercel → **Add New → Project** → import it. Framework: Next.js (detected). Leave the build command empty: Vercel finds `vercel-build`.
- [ ] Settings → General → **Node.js version 22.x** or newer.

### 2. Database (Neon)
- [ ] Project → **Storage → Create Database → Neon** (Marketplace). Region close to the business, e.g. **AWS Asia Pacific (Singapore)** for the Philippines. Connect it to Production, Preview and Development.
- [ ] Check Settings → Environment Variables: `DATABASE_URL` and `DATABASE_URL_UNPOOLED` now exist.
- [ ] Settings → Functions → **Function Region**: the same region as the database (Singapore, `sin1`). Every query crosses this gap.

The app runs every database session in UTC (`src/server/data/client.ts`), whatever the server's default, because the Prisma `pg` adapter assumes UTC; the business's own time zone lives in Settings. Neon already defaults to UTC. If you ever point Reserva at a Postgres whose default isn't UTC (`SHOW timezone`), data written before this setting existed is shifted by that offset: reseed a demo database rather than trusting old times.

### 3. Required variables
- [ ] `BETTER_AUTH_SECRET` — Production (and a *different* one for Preview).
- [ ] `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` — `https://reserva-villaserena.vercel.app` for Production.
- [ ] `PAYMENT_PROVIDER=none` for now; payments come in step 7.

### 4. First deploy
- [ ] Deploy. The build log shows `[vercel-build] production: applying migrations`, three migrations applied, then the Next.js build.
- [ ] Open the site: it says "This site isn't set up yet" — expected until the seed runs.

### 5. Local link to production (for the seed)
```bash
npx vercel link
npx vercel env pull .env.production.local --environment=production
```
`.env*` files are gitignored; delete this one when you're done.

### 6. Seed the business
From your machine, against the direct URL, with real passwords:
```bash
NODE_ENV=production SEED_ALLOW_RESET=true SEED_PRESET=resort SEED_SAMPLE_BOOKINGS=false \
SEED_ADMIN_PASSWORD='a-long-owner-password' SEED_STAFF_PASSWORD='a-long-staff-password' \
npx tsx --env-file=.env.production.local prisma/seed.ts
```
`--env-file` loads the production connection strings for this one command; your local `.env` never overrides them.
- [ ] The seed prints the owner and staff emails. Sign in at `/sign-in` as the owner.
- [ ] In **Settings**, set the real business name, contact details, policy and FAQ. In **Team**, change or add accounts.
- [ ] Delete `.env.production.local`.

### 7. Payment webhooks
Use **test** keys first. Full details and local testing: [PAYMENTS.md](PAYMENTS.md).

**PayMongo** (PHP businesses):
- [ ] Register the webhook:
  ```bash
  curl -X POST https://api.paymongo.com/v1/webhooks -u "sk_test_…:" -H "Content-Type: application/json" \
    -d '{"data":{"attributes":{"url":"https://reserva-villaserena.vercel.app/api/webhooks/paymongo","events":["checkout_session.payment.paid"]}}}'
  ```
- [ ] Set `PAYMENT_PROVIDER=paymongo`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` (the `secret_key` from the response). Business currency must be PHP.

**Stripe** (other currencies):
- [ ] Dashboard → Developers → Webhooks → **Add endpoint** `https://reserva-villaserena.vercel.app/api/webhooks/stripe`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
- [ ] Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Set **Hold while paying** to 30 minutes or more in Settings.

- [ ] Redeploy.

### 8. Background jobs (Inngest)
- [ ] Vercel → **Integrations → Inngest** → add to this project. It sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
- [ ] Redeploy, then in the Inngest dashboard **sync** the app at `https://reserva-villaserena.vercel.app/api/inngest` (the integration usually does this on deploy).
- [ ] Three functions appear: `sweep-expired-holds` (every 5 min), `send-booking-reminders` (hourly; sends at 09:00 business time), `prune-rate-limits` (daily).

### 9. Photo storage (Vercel Blob)
- [ ] Project → **Storage → Create → Blob**, connect to all environments. It sets `BLOB_READ_WRITE_TOKEN`.
- [ ] Redeploy. Admin → Settings → **Logo** now accepts uploads (PNG, JPEG or WebP, up to 1 MB).

### 10. Email (Resend)
- [ ] Verify the client's sending domain in Resend (DNS records).
- [ ] Set `RESEND_API_KEY` and `EMAIL_FROM`. Redeploy.

### 11. Monitoring (optional)
- [ ] Create a Sentry project; set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`. Events are scrubbed of personal data before sending.

### 12. Smoke test (test mode)
- [ ] Home page shows the business, packages and "Next openings".
- [ ] Book something end to end; pay with a test method (Stripe card `4242 4242 4242 4242`, or PayMongo's test GCash page).
- [ ] The booking page flips to **Confirmed** within seconds (webhook delivered: check the provider's webhook log for a `200`).
- [ ] The "received" and "confirmed" emails arrive.
- [ ] `/lookup` with the reference and email opens the booking.
- [ ] Admin: the booking is on the dashboard and calendar; record a cash payment on a walk-in; export the month's CSV.
- [ ] Sign in as staff: Settings, Team and Reports are not reachable.
- [ ] In Inngest, run `send-booking-reminders` manually (it only sends at 09:00 business time; outside that it reports "not 09:00").
- [ ] Response headers include `content-security-policy` (with a nonce) and `strict-transport-security`.

### 13. Go live
- [ ] Custom domain: Vercel → Settings → Domains. Then update `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to it and redeploy.
- [ ] Payments: switch to **live** keys, register a **live** webhook (same URL on the new domain), set its secret. Redeploy.
- [ ] Make one real low-value booking and refund it in the provider's dashboard.

## Updating a deployed client

Push to the main branch. Production builds apply any new migrations before the new code goes live. Migrations are forward-only; write them so the previous deployment keeps working against the new schema during the switch (add columns before using them; remove them in a later release).
