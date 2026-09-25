# Reserva — Booking engine for small businesses

"Booked, paid, confirmed." Customers see real availability, pick a service or package, pay a deposit, and get instant confirmation. Owners run everything from an admin dashboard.

One engine, two booking modes, so it fits many clients:

- **WINDOW mode:** fixed time windows per package. For resorts, private pools, event halls, villas (Day Tour 08:00–17:00, Overnight 19:00–07:00 +1 day, 22 Hours 14:00–12:00 +1 day).
- **SLOT mode:** duration-based slots on a grid inside business hours. For courts, salons, clinics, studios, tours (e.g. 60-min court, 45-min haircut with a chosen staff member).

It's a **single-tenant template**: each client gets their own Vercel project and Neon database, branded through config and seed data. It's also a portfolio flagship, so code quality, security, and UI polish matter equally.

**Quality bar:** the owner's KitaFlux project (github.com/Devlynxz/KitaFlux) — pure, unit-tested domain logic in `lib/`, a single data-access layer, one state machine, Decimal money, concurrency-safe writes, and a README that explains *why*.

## Stack (everything deploys on Vercel)

- Next.js 16 (App Router) + TypeScript strict, Tailwind v4. Backend = Server Actions + Route Handlers in the same app.
- PostgreSQL on **Neon, added from the Vercel Marketplace** (sets `DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED` direct) + Prisma 7 (`prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg`). URLs live in `prisma.config.ts` (direct, for migrations), not `schema.prisma`; the runtime client uses the pooled URL.
- Better Auth — email/password for ADMIN/STAFF only. Customers never create accounts.
- decimal.js for all money; store `Decimal(12,2)` + currency code from settings.
- zod on every input (forms, server actions, webhooks).
- Payments behind `server/payments/provider.ts`:
  - `paymongo.ts` — Checkout Sessions (GCash, Maya, card) for PH clients
  - `stripe.ts` — Checkout Sessions for international clients
  - Active provider chosen by env; both in test mode until a client goes live.
- Resend + react-email · Inngest (Vercel integration) for jobs · Vercel Blob for photos.
- Sentry optional (off without DSN) with PII scrubbing · Vitest.
- Timezone configurable per business (default `Asia/Manila`); store `timestamptz`; zone math via `@date-fns/tz`. Times of day are integer minutes after local midnight.

## Architecture rules

1. **The database prevents double bookings, not the UI.**
   - `bookings` has `start_at`/`end_at`/`occupied_until` (= end + buffer, set by the server) + generated `span tstzrange GENERATED ALWAYS AS (tstzrange(start_at, occupied_until, '[)')) STORED`, so turnover buffers are DB-enforced too.
   - `EXCLUDE USING gist (resource_id WITH =, span WITH &&) WHERE (status IN ('PENDING_PAYMENT','CONFIRMED'))` (needs `btree_gist`).
   - Prisma can't express this: declare `span` as `Unsupported("tstzrange")?`, create the migration with `--create-only`, hand-write the SQL.
   - `blocked_periods` has the same generated `span` + GiST index (no self-exclusion — overlapping blocks are harmless; `resource_id NULL` = whole business). "No active booking inside a block" is cross-table, so two triggers enforce it under a shared per-resource advisory lock, raising `23P01`. Locks are always taken in ascending resource id order.
2. **Resources are what gets booked** — a villa, court, room, or staff member. For "any available staff", lock the candidates (id order) and pick the first free one inside the same transaction.
3. **Holds expire lazily and on schedule.** ONLINE bookings start `PENDING_PAYMENT` with `hold_expires_at = now() + Settings.holdMinutes` (15 PayMongo / 30 Stripe — Stripe Checkout can't expire sooner). Staff-created WALK_IN/MESSAGE bookings start `CONFIRMED`, or `PENDING_PAYMENT` with no hold. In the create transaction, expire stale holds for that resource first, then insert. Inngest sweeps every 5 min as a backstop. Catch SQLSTATE `23P01` → friendly "that time was just taken" (constraint name distinguishes booking vs block conflicts).
4. **Prices are computed only on the server** in `lib/pricing.ts` (pure, tested): base → weekend → most-specific date-range override → extra guests (above `includedGuests`) → deposit %. The client never sends a price. The quote is snapshotted on the booking (`priceBreakdown`). Add-ons are out of scope for v1.
5. **Only the webhook confirms payment.** `app/api/webhooks/[provider]/route.ts` verifies the signature on the raw body, is idempotent via unique `provider_event_id`, checks amount + currency, transitions through the state machine, records a `Payment`. Success pages only read status. A late payment on an EXPIRED booking re-confirms it if the slot is still free; otherwise the payment is recorded and surfaced as "needs refund".
6. **One state machine** in `lib/booking-status.ts`: `PENDING_PAYMENT → CONFIRMED | EXPIRED | CANCELLED`; `EXPIRED → CONFIRMED` (webhook only, late payment); `CONFIRMED → COMPLETED | NO_SHOW | CANCELLED` (COMPLETED/NO_SHOW only at/after start). `initialStatus(source)` decides the first state. Status is written only by `transitionBooking` / `expireStaleHolds` in `server/data`; every transition writes a `BookingEvent`.
7. **Customer data stays private.** Public availability returns only `{ resourceId, startAt, endAt }`. Lookup needs `reference_code` + email. `/book/[ref]` also needs an unguessable `?t=` token (only its sha256 is stored) — reference codes are read aloud, not secret. `internalNotes` never leave the admin. Public endpoints are rate-limited (DB-backed, like KitaFlux).
8. **Prisma only in `server/data/*`.** Server actions: validate → delegate → revalidate.
9. **White-label via config.** Name, logo, colors, currency, timezone, deposit %, policies come from `Settings` + `reserva.config.ts`. `Settings` (DB, ADMIN-editable) is the runtime source of truth; `reserva.config.ts` holds build-time items (fonts, OG fallback, feature flags) and seeds `Settings`. New client = new env + seed, not code changes. PayMongo requires `currency = PHP` (fail fast otherwise).

## Core models (refine, don't bloat)

Full schema + hand-written SQL: `docs/PLAN.md` §2.

- `User`/`Session`/`Account`/`Verification` (Better Auth) + `role: ADMIN | STAFF`, `disabledAt`. Sign-up disabled; ADMIN manages staff at `/admin/team`.
- `Resource`: slug, name, type `SPACE | STAFF`, description, capacity, photos, isActive, sortOrder
- `Offering` (package/service): slug, resources (m2m), name, mode `WINDOW | SLOT`; WINDOW: startMinute, endMinute, endsNextDay (CHECK-enforced = end ≤ start); SLOT: durationMin, slotStepMin; both: bufferMin, basePrice, weekendPrice, includedGuests, maxGuests, extraGuestFee, isActive
- `BusinessHours` (resourceId?, weekday, openMinute, closeMinute) — resource rows replace global rows for that weekday; several rows = split shifts
- `PricingOverride`: resourceId?, offeringId?, startDate, endDate (inclusive), fixedPrice | multiplier, label
- `BlockedPeriod`: resourceId? (null = whole business), startAt, endAt, span*, reason
- `Booking`: referenceCode (unique), accessTokenHash, resourceId, offeringId, startAt, endAt, occupiedUntil, span*, customerName/Email/Phone, guestCount, customerNotes, internalNotes, totalAmount, depositAmount, amountPaid, currency, priceBreakdown, status, source `ONLINE | WALK_IN | MESSAGE`, holdExpiresAt, paymentProvider, checkoutSessionId, reminderSentAt
- `Payment`: bookingId, provider `PAYMONGO | STRIPE | MANUAL`, providerRef, providerEventId (unique per provider), amount, currency, method, status, raw (scrubbed), recordedById
- `BookingEvent`: bookingId, fromStatus, toStatus, actorId?, note
- `Settings` (singleton, CHECK id = 1) incl. holdMinutes, weekendDays, leadTimeMin, maxAdvanceDays, content (landing JSON)
- `RateLimit` (DB-backed fixed window)

## Structure

```
src/app/(public)/        landing, /book, /book/[ref], /lookup
src/app/(auth)/          sign-in
src/app/(admin)/admin/   dashboard, calendar, bookings, resources, offerings, hours, pricing, blocked, settings, team, reports
src/app/api/             auth/[...all], availability, webhooks/[provider], inngest, admin/reports/export
src/components/          ui/, booking/, admin/
src/lib/                 money, dates, intervals, windows, slots, pricing, booking-status, reference-code, validation, csv
src/server/              data/, actions/, payments/, email/, inngest/, session.ts
src/proxy.ts             CSP nonce + cheap /admin redirect (authz is enforced in layouts/actions/data, never only here)
src/generated/prisma/    generated client (gitignored)
prisma/                  schema.prisma, migrations/, seed.ts (presets: resort, court, salon)
prisma.config.ts · reserva.config.ts
```

## Tests that must exist

- `pricing`, `windows`, `slots` (grid, buffers, hours, timezone edges), `booking-status`
- **20-way concurrent race** on one slot → exactly one succeeds; "any staff" concurrency spreads across resources
- Expired hold frees the slot; non-overlapping day tour + overnight coexist; buffer overlap rejected by the DB
- Booking into a block and block over an active booking both rejected; no Prisma schema drift
- Webhooks (both providers): bad signature rejected, duplicate event is a no-op, amount mismatch not confirmed, late payment handled
- Availability responses contain no customer PII
- STAFF cannot reach settings, team, or reports

## Definition of done

375px works · loading/empty/error states · zod-validated · `typecheck`, `lint`, `test`, `build` pass.

Out of scope for v1: provider refunds, rescheduling, multi-resource bookings, add-ons, customer accounts.

## Commands

`npm run dev` · `build` · `test` · `typecheck` · `lint` · `db:migrate` · `db:deploy` · `db:seed` (`SEED_PRESET=resort|court|salon`)
