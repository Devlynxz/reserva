# Reserva — Phase 0 plan

Status: proposal for review. No code yet. Everything here is subject to the "Changes to CLAUDE.md" section at the bottom — accept or reject those first, then Phase 1 starts.

Quality bar: KitaFlux — pure tested `lib/`, one data-access layer (`server/data/*`), one state machine, `Decimal` money with `ROUND_HALF_UP`, concurrency-safe writes proven by a 20-way race test, per-request CSP nonce in `src/proxy.ts`, DB suites auto-skip without `DATABASE_URL`, README that explains *why*.

---

## 1. Phase plan

| # | Phase | Output | Gate |
|---|---|---|---|
| 0 | Plan | this document | your sign-off on §8 |
| 1 | Scaffold | Next 16 + strict TS + Tailwind v4 + ESLint + Vitest; Prisma 7 (`prisma-client`, `prisma.config.ts`, `@prisma/adapter-pg`); Better Auth + `role`; `reserva.config.ts`; `.env.example`; `components/ui` (Button, Field, Card, Table, Badge, Dialog, Stepper) with brand tokens, light/dark; `src/proxy.ts` stub | typecheck · lint · test · build |
| 2 | Domain logic | `lib/` modules in §4, ~100% branch coverage | `test` |
| 3 | Database | schema + migrations incl. hand-written SQL (§2.3); `server/data/*`; `createBooking`; seeds `resort` / `court` / `salon`; DB tests incl. 20-way race | `test` with `DATABASE_URL`; `prisma migrate diff` shows no drift |
| 4 | Public site | landing, `/book` stepper, availability calendar (WINDOW) + slot picker (SLOT), `/book/[ref]`, `/lookup`, rate limits, SEO + OG image | 375px, loading/empty/error states |
| 5 | Payments, email, jobs | provider interface, PayMongo + Stripe, webhooks, react-email templates, Inngest sweep + reminders; all keys optional | webhook tests (both providers) |
| 6 | Admin | dashboard, calendar, bookings, manual bookings, CRUD, settings, team, reports + CSV | STAFF authz tests |
| 7 | Polish | a11y, CSP nonce, Sentry scrubbing, demo banner/login, README | full gate chain |
| 8 | Deploy | Vercel checklist, local production build | `next build` with prod env |

Each phase ends with typecheck · lint · test · build green and a commit.

---

## 2. Database

### 2.1 Conventions

- Domain tables: `uuid` v7 ids (`@default(uuid(7)) @db.Uuid`), snake_case columns via `@map`, plural table names via `@@map`. snake_case keeps the hand-written SQL readable.
- Better Auth tables keep Better Auth's shapes (text ids, singular names). Generate with `npx @better-auth/cli generate`, then reconcile with the schema below.
- Every instant is `timestamptz` (`@db.Timestamptz(6)`). Calendar dates such as override ranges are `date`.
- Times of day are **integer minutes after local midnight** (0–1439, and 1440 allowed for `close`). No `time` columns: Prisma maps them to JS `Date`, which invites timezone bugs.
- Money is `Decimal(12,2)`. Currency is ISO-4217 `char(3)` and is copied onto every booking and payment.

### 2.2 `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

// Prisma 7: connection URLs live in prisma.config.ts, not here.
datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  STAFF
}

enum ResourceType {
  SPACE // villa, court, room, hall
  STAFF // stylist, therapist, guide
}

enum BookingMode {
  WINDOW
  SLOT
}

enum BookingStatus {
  PENDING_PAYMENT
  CONFIRMED
  EXPIRED
  CANCELLED
  COMPLETED
  NO_SHOW
}

enum BookingSource {
  ONLINE
  WALK_IN
  MESSAGE
}

enum PaymentProvider {
  PAYMONGO
  STRIPE
  MANUAL // cash / bank transfer recorded by staff
}

enum PaymentStatus {
  SUCCEEDED
  FAILED
  REFUNDED
}

// ─── Better Auth ────────────────────────────────────────────────────────────

model User {
  id            String         @id
  name          String
  email         String         @unique
  emailVerified Boolean        @default(false)
  image         String?
  role          Role           @default(STAFF)
  disabledAt    DateTime?      @db.Timestamptz(6)
  createdAt     DateTime       @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime       @updatedAt @db.Timestamptz(6)
  sessions      Session[]
  accounts      Account[]
  bookingEvents BookingEvent[]
  payments      Payment[]

  @@map("user")
}

model Session {
  id        String   @id
  token     String   @unique
  expiresAt DateTime @db.Timestamptz(6)
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)

  @@index([userId])
  @@map("session")
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime? @db.Timestamptz(6)
  refreshTokenExpiresAt DateTime? @db.Timestamptz(6)
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt             DateTime  @updatedAt @db.Timestamptz(6)

  @@index([userId])
  @@map("account")
}

model Verification {
  id         String   @id
  identifier String
  value      String
  expiresAt  DateTime @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  updatedAt  DateTime @updatedAt @db.Timestamptz(6)

  @@index([identifier])
  @@map("verification")
}

// ─── Catalog ────────────────────────────────────────────────────────────────

model Resource {
  id               String            @id @default(uuid(7)) @db.Uuid
  slug             String            @unique
  name             String
  type             ResourceType      @default(SPACE)
  description      String?
  capacity         Int?
  photos           String[]          // Vercel Blob URLs
  isActive         Boolean           @default(true) @map("is_active")
  sortOrder        Int               @default(0) @map("sort_order")
  createdAt        DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  offerings        Offering[]
  businessHours    BusinessHours[]
  pricingOverrides PricingOverride[]
  blockedPeriods   BlockedPeriod[]
  bookings         Booking[]

  @@map("resources")
}

model Offering {
  id               String            @id @default(uuid(7)) @db.Uuid
  slug             String            @unique
  name             String
  description      String?
  mode             BookingMode

  // WINDOW: fixed local window, e.g. Overnight 19:00 → 07:00 (+1 day)
  startMinute      Int?              @map("start_minute")
  endMinute        Int?              @map("end_minute")
  endsNextDay      Boolean           @default(false) @map("ends_next_day")

  // SLOT: duration on a grid inside business hours
  durationMin      Int?              @map("duration_min")
  slotStepMin      Int?              @map("slot_step_min")

  // Both modes: cleaning / turnover time after each booking
  bufferMin        Int               @default(0) @map("buffer_min")

  basePrice        Decimal           @map("base_price") @db.Decimal(12, 2)
  weekendPrice     Decimal?          @map("weekend_price") @db.Decimal(12, 2)
  includedGuests   Int               @default(1) @map("included_guests")
  maxGuests        Int               @default(1) @map("max_guests")
  extraGuestFee    Decimal           @default(0) @map("extra_guest_fee") @db.Decimal(12, 2)

  isActive         Boolean           @default(true) @map("is_active")
  sortOrder        Int               @default(0) @map("sort_order")
  createdAt        DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)
  resources        Resource[]        // implicit m2m: which resources can take this offering
  pricingOverrides PricingOverride[]
  bookings         Booking[]

  @@map("offerings")
}

/// Rows for a weekday. No rows means closed. A resource with any rows of its own follows
/// only its own schedule; otherwise the global (resourceId = null) rows. Several rows per day allow split shifts.
model BusinessHours {
  id          String    @id @default(uuid(7)) @db.Uuid
  resourceId  String?   @map("resource_id") @db.Uuid
  resource    Resource? @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  weekday     Int       // 0 = Sunday … 6 = Saturday, in the business timezone
  openMinute  Int       @map("open_minute")
  closeMinute Int       @map("close_minute")

  @@index([resourceId, weekday])
  @@map("business_hours")
}

/// Date-range price change, e.g. Holy Week. Exactly one of fixedPrice / multiplier.
/// null resourceId / offeringId = applies to all. The most specific match wins.
model PricingOverride {
  id         String    @id @default(uuid(7)) @db.Uuid
  resourceId String?   @map("resource_id") @db.Uuid
  resource   Resource? @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  offeringId String?   @map("offering_id") @db.Uuid
  offering   Offering? @relation(fields: [offeringId], references: [id], onDelete: Cascade)
  startDate  DateTime  @map("start_date") @db.Date // inclusive, business-local
  endDate    DateTime  @map("end_date") @db.Date   // inclusive
  fixedPrice Decimal?  @map("fixed_price") @db.Decimal(12, 2)
  multiplier Decimal?  @db.Decimal(6, 3)
  label      String
  createdAt  DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([startDate, endDate])
  @@map("pricing_overrides")
}

/// null resourceId = the whole business is closed (holiday, typhoon).
model BlockedPeriod {
  id          String                    @id @default(uuid(7)) @db.Uuid
  resourceId  String?                   @map("resource_id") @db.Uuid
  resource    Resource?                 @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  startAt     DateTime                  @map("start_at") @db.Timestamptz(6)
  endAt       DateTime                  @map("end_at") @db.Timestamptz(6)
  span        Unsupported("tstzrange")? // GENERATED — see migration
  reason      String?
  createdById String?                   @map("created_by_id")
  createdAt   DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("blocked_periods")
}

// ─── Bookings ───────────────────────────────────────────────────────────────

model Booking {
  id                String                    @id @default(uuid(7)) @db.Uuid
  referenceCode     String                    @unique @map("reference_code")
  accessTokenHash   String                    @unique @map("access_token_hash") // sha256 of the /book/[ref]?t= token

  resourceId        String                    @map("resource_id") @db.Uuid
  resource          Resource                  @relation(fields: [resourceId], references: [id], onDelete: Restrict)
  offeringId        String                    @map("offering_id") @db.Uuid
  offering          Offering                  @relation(fields: [offeringId], references: [id], onDelete: Restrict)

  startAt           DateTime                  @map("start_at") @db.Timestamptz(6)
  endAt             DateTime                  @map("end_at") @db.Timestamptz(6)
  occupiedUntil     DateTime                  @map("occupied_until") @db.Timestamptz(6) // endAt + buffer
  span              Unsupported("tstzrange")? // GENERATED [start_at, occupied_until)

  customerName      String                    @map("customer_name")
  customerEmail     String                    @map("customer_email")
  customerPhone     String?                   @map("customer_phone")
  guestCount        Int                       @default(1) @map("guest_count")
  customerNotes     String?                   @map("customer_notes")
  internalNotes     String?                   @map("internal_notes")

  totalAmount       Decimal                   @map("total_amount") @db.Decimal(12, 2)
  depositAmount     Decimal                   @map("deposit_amount") @db.Decimal(12, 2)
  amountPaid        Decimal                   @default(0) @map("amount_paid") @db.Decimal(12, 2)
  currency          String                    @db.Char(3)
  priceBreakdown    Json                      @map("price_breakdown") // snapshot of the quote lines

  status            BookingStatus             @default(PENDING_PAYMENT)
  source            BookingSource             @default(ONLINE)
  holdExpiresAt     DateTime?                 @map("hold_expires_at") @db.Timestamptz(6)
  paymentProvider   PaymentProvider?          @map("payment_provider")
  checkoutSessionId String?                   @unique @map("checkout_session_id")
  reminderSentAt    DateTime?                 @map("reminder_sent_at") @db.Timestamptz(6)

  createdAt         DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime                  @updatedAt @map("updated_at") @db.Timestamptz(6)
  payments          Payment[]
  events            BookingEvent[]

  @@index([resourceId, startAt])
  @@index([status, holdExpiresAt])
  @@index([startAt])
  @@index([customerEmail])
  @@map("bookings")
}

model Payment {
  id              String          @id @default(uuid(7)) @db.Uuid
  bookingId       String          @map("booking_id") @db.Uuid
  booking         Booking         @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  provider        PaymentProvider
  providerRef     String?         @map("provider_ref")       // payment / intent id
  providerEventId String?         @map("provider_event_id")  // webhook event id; null for MANUAL
  amount          Decimal         @db.Decimal(12, 2)
  currency        String          @db.Char(3)
  method          String          // card | gcash | maya | cash | bank_transfer …
  status          PaymentStatus
  raw             Json?           // scrubbed provider payload, no PII
  recordedById    String?         @map("recorded_by_id")
  recordedBy      User?           @relation(fields: [recordedById], references: [id], onDelete: SetNull)
  createdAt       DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([provider, providerEventId])
  @@index([bookingId])
  @@map("payments")
}

model BookingEvent {
  id         String         @id @default(uuid(7)) @db.Uuid
  bookingId  String         @map("booking_id") @db.Uuid
  booking    Booking        @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  fromStatus BookingStatus? @map("from_status") // null = created
  toStatus   BookingStatus  @map("to_status")
  actorId    String?        @map("actor_id")    // null = customer / system / webhook
  actor      User?          @relation(fields: [actorId], references: [id], onDelete: SetNull)
  note       String?
  createdAt  DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([bookingId, createdAt])
  @@map("booking_events")
}

// ─── Config & infra ─────────────────────────────────────────────────────────

/// Singleton (CHECK id = 1). Runtime-editable by ADMIN; seeded from reserva.config.ts.
model Settings {
  id             Int      @id @default(1)
  businessName   String   @map("business_name")
  tagline        String?
  logoUrl        String?  @map("logo_url")
  brandColor     String   @default("#0f766e") @map("brand_color")
  currency       String   @default("PHP") @db.Char(3)
  timezone       String   @default("Asia/Manila")
  depositPercent Decimal  @default(50) @map("deposit_percent") @db.Decimal(5, 2)
  holdMinutes    Int      @default(15) @map("hold_minutes")
  weekendDays    Int[]    @default([0, 6]) @map("weekend_days")
  leadTimeMin    Int      @default(60) @map("lead_time_min")      // earliest bookable start from now
  maxAdvanceDays Int      @default(180) @map("max_advance_days")
  contactEmail   String?  @map("contact_email")
  contactPhone   String?  @map("contact_phone")
  address        String?
  mapUrl         String?  @map("map_url")
  policies       String?  // cancellation / house rules, markdown
  content        Json     @default("{}") // landing: hero, amenities, FAQ
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("settings")
}

/// DB-backed fixed-window rate limiter (KitaFlux pattern). Pruned by Inngest.
model RateLimit {
  key         String   @id // e.g. "booking.create:ip:203.0.113.7"
  count       Int
  windowStart DateTime @map("window_start") @db.Timestamptz(6)

  @@index([windowStart])
  @@map("rate_limits")
}
```

`prisma.config.ts` uses the **direct** URL, so migrations don't go through the pooler. The runtime client uses the **pooled** URL:

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL_UNPOOLED") }, // set by the Neon Marketplace integration
});

// src/server/data/db.ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! }); // pooled
export const db = new PrismaClient({ adapter });
```

### 2.3 Hand-written SQL

Migration 1, `init`, is generated by Prisma unchanged. Migration 2, `booking_integrity`, is created with `prisma migrate dev --create-only --name booking_integrity` and written by hand:

```sql
-- prisma/migrations/<ts>_booking_integrity/migration.sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Singleton & catalog invariants ──────────────────────────────────────────
ALTER TABLE settings
  ADD CONSTRAINT settings_singleton   CHECK (id = 1),
  ADD CONSTRAINT settings_deposit_pct CHECK (deposit_percent > 0 AND deposit_percent <= 100),
  ADD CONSTRAINT settings_hold        CHECK (hold_minutes BETWEEN 5 AND 1440),
  ADD CONSTRAINT settings_currency    CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE offerings
  ADD CONSTRAINT offerings_mode_fields CHECK (
    (mode = 'WINDOW'
       AND start_minute BETWEEN 0 AND 1439
       AND end_minute   BETWEEN 0 AND 1439
       AND ends_next_day = (end_minute <= start_minute)   -- flag must agree with the times
       AND duration_min IS NULL AND slot_step_min IS NULL)
    OR
    (mode = 'SLOT'
       AND duration_min > 0 AND slot_step_min > 0
       AND start_minute IS NULL AND end_minute IS NULL AND NOT ends_next_day)
  ),
  ADD CONSTRAINT offerings_buffer CHECK (buffer_min >= 0),
  ADD CONSTRAINT offerings_money  CHECK (
    base_price >= 0 AND extra_guest_fee >= 0 AND (weekend_price IS NULL OR weekend_price >= 0)
  ),
  ADD CONSTRAINT offerings_guests CHECK (included_guests >= 1 AND max_guests >= included_guests);

ALTER TABLE business_hours
  ADD CONSTRAINT business_hours_range CHECK (
    weekday BETWEEN 0 AND 6 AND open_minute >= 0 AND close_minute <= 1440 AND open_minute < close_minute
  );

ALTER TABLE pricing_overrides
  ADD CONSTRAINT pricing_overrides_one_rule CHECK (num_nonnulls(fixed_price, multiplier) = 1),
  ADD CONSTRAINT pricing_overrides_range    CHECK (start_date <= end_date),
  ADD CONSTRAINT pricing_overrides_values   CHECK (
    (fixed_price IS NULL OR fixed_price >= 0) AND (multiplier IS NULL OR multiplier > 0)
  );

-- ── Bookings: generated span + exclusion constraint ────────────────────────
-- Prisma created span as a plain nullable column; replace it with a generated one.
-- The span covers the trailing buffer so turnover time is enforced by the DB too.
ALTER TABLE bookings DROP COLUMN span;
ALTER TABLE bookings
  ADD COLUMN span tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, occupied_until, '[)')) STORED;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_time_order CHECK (start_at < end_at AND end_at <= occupied_until),
  ADD CONSTRAINT bookings_guests     CHECK (guest_count >= 1),
  ADD CONSTRAINT bookings_currency   CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT bookings_amounts    CHECK (
    total_amount >= 0 AND deposit_amount >= 0 AND deposit_amount <= total_amount AND amount_paid >= 0
  ),
  -- online holds must expire; staff-created "awaiting payment" bookings may not
  ADD CONSTRAINT bookings_online_hold CHECK (
    NOT (status = 'PENDING_PAYMENT' AND source = 'ONLINE' AND hold_expires_at IS NULL)
  );

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (resource_id WITH =, span WITH &&)
  WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED'));

CREATE INDEX bookings_hold_sweep_idx ON bookings (hold_expires_at)
  WHERE status = 'PENDING_PAYMENT';

-- ── Blocked periods: generated span + GiST index ────────────────────────────
-- Overlapping blocks are harmless, so there is no self-exclusion. The rule that matters,
-- "no active booking overlaps a block", spans two tables, so triggers enforce it.
ALTER TABLE blocked_periods DROP COLUMN span;
ALTER TABLE blocked_periods
  ADD COLUMN span tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;
ALTER TABLE blocked_periods
  ADD CONSTRAINT blocked_periods_time_order CHECK (start_at < end_at);
CREATE INDEX blocked_periods_span_idx ON blocked_periods USING gist (resource_id, span);

-- ── Cross-table guard: bookings × blocked periods ───────────────────────────
-- Both sides take the same per-resource transaction lock, so a booking and a block
-- can't commit into the same time concurrently. Violations raise SQLSTATE 23P01
-- (exclusion_violation), so the app needs a single error path. The constraint name
-- tells the two cases apart.
CREATE FUNCTION reserva_lock_resource(rid uuid) RETURNS void
LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('reserva:resource:' || rid::text, 0));
$$;

CREATE FUNCTION bookings_guard_blocked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM reserva_lock_resource(NEW.resource_id);
  -- NEW.span isn't computed yet in a BEFORE trigger, so build the range here.
  IF EXISTS (
    SELECT 1 FROM blocked_periods b
    WHERE (b.resource_id = NEW.resource_id OR b.resource_id IS NULL)
      AND b.span && tstzrange(NEW.start_at, NEW.occupied_until, '[)')
  ) THEN
    RAISE EXCEPTION 'Requested time overlaps a blocked period'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'bookings_blocked_period';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER bookings_guard_blocked
  BEFORE INSERT OR UPDATE OF status, resource_id, start_at, occupied_until ON bookings
  FOR EACH ROW
  WHEN (NEW.status IN ('PENDING_PAYMENT', 'CONFIRMED'))
  EXECUTE FUNCTION bookings_guard_blocked();

CREATE FUNCTION blocked_periods_guard_bookings() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE r uuid;
BEGIN
  IF NEW.resource_id IS NULL THEN
    FOR r IN SELECT id FROM resources ORDER BY id LOOP   -- fixed order: no deadlocks
      PERFORM reserva_lock_resource(r);
    END LOOP;
  ELSE
    PERFORM reserva_lock_resource(NEW.resource_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM bookings bk
    WHERE (NEW.resource_id IS NULL OR bk.resource_id = NEW.resource_id)
      AND bk.status IN ('PENDING_PAYMENT', 'CONFIRMED')
      AND bk.span && tstzrange(NEW.start_at, NEW.end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Active bookings exist in this period'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'blocked_periods_overlap_bookings';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER blocked_periods_guard_bookings
  BEFORE INSERT OR UPDATE OF resource_id, start_at, end_at ON blocked_periods
  FOR EACH ROW EXECUTE FUNCTION blocked_periods_guard_bookings();
```

Things to verify in Phase 3 (each has a test):
- `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma` shows no drift. Prisma doesn't model generated columns, exclusion constraints or triggers, and it must not try to drop them.
- Prisma never writes `span`. `Unsupported(...)?` fields are excluded from create/update inputs.
- Lock order: every path locks resources in ascending `id` order (single resource, "any staff" pre-lock, global block). No deadlocks.

---

## 3. One booking path for WINDOW and SLOT

Only one step depends on the mode: turning the customer's choice into a time span. Everything after it — pricing, the transaction, the constraint, payment, the state machine — works on `{ startAt, endAt, occupiedUntil }` and doesn't know which mode produced it.

```
input (zod: bookingRequestSchema — has no price field; unknown keys are rejected)
  { offeringSlug, resourceId | "any", date: "YYYY-MM-DD", startTime?: "HH:mm" (SLOT only),
    guestCount, customer{name,email,phone}, notes, source }
        │
        ▼
resolveSpan(offering, input, settings.timezone)            ← the only mode-specific step
  WINDOW → lib/windows.windowSpan(offering, date, tz)
  SLOT   → lib/slots.slotSpan(offering, date, startTime, tz)
           + lib/slots.isOnGrid(...) against business hours (rejects off-grid / out-of-hours times)
  both   → occupiedUntil = endAt + bufferMin
           lead time and max-advance checks against settings
        │
        ▼
lib/pricing.quote({ offering, localDate, guestCount, overrides, settings }) → total, deposit, lines
        │
        ▼
server/data/bookings.createBooking   — one db.$transaction
  1. candidates = [resourceId] or the offering's active resources, ordered by sortOrder
  2. lock candidates in id order (reserva_lock_resource)
  3. lazily expire stale holds on the candidates: status → EXPIRED through the state machine,
     plus a BookingEvent each
  4. pick the first candidate with no active overlapping booking or block ("any staff")
     none → BookingConflictError
  5. INSERT booking: referenceCode (retry on unique clash), accessTokenHash,
     status/hold from lib/booking-status.initial(source)
  6. INSERT BookingEvent(null → status)
  catch 23P01 → BookingConflictError("That time was just taken") — mapped by constraint name
        │
        ▼
ONLINE: payments.provider.createCheckout(booking) outside the transaction
  → save checkoutSessionId + provider; if the provider call fails → CANCELLED (frees the slot)
  → redirect to the checkout URL
WALK_IN / MESSAGE: optional cash Payment recorded; no checkout
```

Admin walk-in and message bookings call the same `createBooking`, with `source` and `actorId` set.

Availability uses the same split. `getAvailability(offering, from, to)` loads active bookings (excluding stale holds) and blocks for the offering's resources in **one query each**, selecting only `resource_id, start_at, occupied_until`, then passes them to the pure `lib/windows` / `lib/slots` functions. Public output is `{ resourceId, startAt, endAt }[]` for **free** options only.

---

## 4. `lib/` modules and their tests

All pure. They take no `Date.now()` directly (callers pass `now`) and import no Prisma.

| Module | Responsibility | Test cases (Vitest) |
|---|---|---|
| `money.ts` | `money(x)`, add/mul/percent, `round2` (ROUND_HALF_UP), `toMinorUnits(amount, currency)` (JPY = 0 decimals), `format(amount, currency, locale)` | half-up at .005, float inputs rejected, 0-decimal currencies, minor-unit round trip, negative guard |
| `dates.ts` | business-timezone helpers on `@date-fns/tz`: `zonedToUtc(date, minute, tz)`, `localDateOf(instant, tz)`, `weekdayOf(date)`, `addDays`, `parseLocalDate` | Manila (no DST), America/New_York spring-forward gap and fall-back overlap, year/month rollover, invalid dates |
| `intervals.ts` | `[start, end)` overlap semantics matching `tstzrange '[)'`; merge; subtract | touching ends don't overlap, containment, empty ranges |
| `windows.ts` | `windowSpan(offering, date, tz)` → `{startAt, endAt}`; `windowAvailability(offering, dates, resources, busy, blocked, now)` | Day Tour 08–17, Overnight 19–07 +1, 22 Hours 14–12 +1, Day Tour + Overnight coexist, 22 Hours conflicts with both, buffer respected, DST day, lead time / max advance |
| `slots.ts` | `slotGrid(hours, durationMin, stepMin)`, `slotSpan`, `isOnGrid`, `freeSlots({date, hours, offering, resources, busy, blocked, now, tz, leadTimeMin})` | grid from hours, last slot must end by close, buffer between bookings, split shifts, resource hours replace global, closed day, "any staff" union, timezone edges (UTC date ≠ local date), lead-time cutoff |
| `pricing.ts` | `quote(...)`: base → weekend → most-specific override (fixed or ×) → extra guests → total → deposit % | each step alone and combined, override specificity order, fixed vs multiplier, weekend night = window start date, guests > max rejected, deposit rounding, currency carried through |
| `booking-status.ts` | transition table, `initialStatus(source)`, `assertTransition(from, to, actor, ctx)`, `isActive(status)` | full from×to matrix (allowed and forbidden), actor rules (EXPIRED→CONFIRMED only by webhook), COMPLETED/NO_SHOW only after `startAt` |
| `reference-code.ts` | `generate(rng)` → `RSV-XXXXX` from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L); `normalize` (case, spaces, dashes); `isValid` | alphabet, length, normalize round trip, deterministic with a seeded rng |
| `validation.ts` | zod schemas: booking request, lookup, admin CRUD inputs, settings; `.strict()` on public inputs | rejects price fields, bad email, guest bounds, `HH:mm` / date formats, SLOT needs startTime |
| `csv.ts` (Phase 6) | RFC-4180 quoting + formula-injection neutralizing (`= + - @ \t \r` prefixed with `'`) | each dangerous prefix, quotes, newlines |

Server and DB tests (`src/server/__tests__`, auto-skip without `DATABASE_URL`):

| Suite | Proves |
|---|---|
| `booking-race` | 20 concurrent `createBooking` on one slot → exactly 1 succeeds, 19 get `BookingConflictError` |
| `booking-any-staff` | 3 staff, 5 concurrent "any" requests → 3 succeed on 3 different resources |
| `booking-holds` | expired hold frees the slot (lazy path + sweep) and writes an EXPIRED event |
| `booking-windows` | Day Tour + Overnight coexist on one villa; 22 Hours conflicts |
| `booking-buffer` | back-to-back SLOT bookings inside the buffer are rejected by the DB, not only by `lib` |
| `blocked-periods` | booking into a block rejected; block over an active booking rejected; concurrent booking vs block → one wins |
| `webhooks-paymongo`, `webhooks-stripe` | bad signature → 400 and no writes; duplicate event → no-op; amount/currency mismatch → not confirmed; late payment on EXPIRED booking |
| `availability-pii` | public availability JSON has only `resourceId/startAt/endAt` keys |
| `authz` | STAFF blocked from settings/reports/team actions and routes |
| `rate-limit` | Nth+1 call in window rejected; window reset |
| `migrations` | no schema drift; `span` is generated |

---

## 5. State machine (`lib/booking-status.ts`)

| From → To | Allowed actors | Notes |
|---|---|---|
| *(new)* → PENDING_PAYMENT | customer, staff | ONLINE always starts here with a hold. Staff can pick "awaiting payment" (no hold) |
| *(new)* → CONFIRMED | staff | walk-in / message booking, paid or pay-on-arrival |
| PENDING_PAYMENT → CONFIRMED | webhook, staff (cash) | |
| PENDING_PAYMENT → EXPIRED | system | lazy in `createBooking` + Inngest sweep |
| PENDING_PAYMENT → CANCELLED | staff, system | system = checkout creation failed |
| **EXPIRED → CONFIRMED** | webhook only | late payment. The DB decides whether the slot is still free. If not, the payment is recorded and the booking is flagged for refund |
| CONFIRMED → COMPLETED / NO_SHOW | staff | only at/after `startAt` |
| CONFIRMED → CANCELLED | staff | refunds handled by hand in v1 |

Data layer: `transitionBooking(tx, id, to, actor, note)` is the **only** code that writes `status`. It locks the row (`SELECT … FOR UPDATE`), calls `assertTransition`, updates, and writes the `BookingEvent`. `expireStaleHolds(tx, resourceIds)` is its bulk twin and uses the same assert.

---

## 6. Route map

**Public** — `src/app/(public)/`

| Route | Kind | Notes |
|---|---|---|
| `/` | RSC | hero, offerings, amenities, location, FAQ, contact, Book now. Content from `Settings.content` |
| `/book` | RSC + client stepper | steps: offering → resource/staff + date/time → details → review (server quote) → pay. Step state lives in search params |
| `/book/[ref]` | RSC | needs `?t=` access token; shows status only, polling while PENDING. Also the checkout success/cancel return URL |
| `/lookup` | RSC + action | reference + email → redirect to `/book/[ref]?t=` (reissues the token) |
| `/opengraph-image`, `sitemap.ts`, `robots.ts` | metadata | `/admin` disallowed |

**Auth** — `src/app/(auth)/sign-in`

**Admin** — `src/app/(admin)/admin/` (layout calls `requireStaff()`. Pages marked ★ call `requireAdmin()`)

`/admin` dashboard · `/admin/calendar` · `/admin/bookings` · `/admin/bookings/new` · `/admin/bookings/[id]` · `/admin/resources` (+ `new`, `[id]`) · `/admin/offerings` (+ `new`, `[id]`) · `/admin/hours` · `/admin/pricing` (overrides) · `/admin/blocked` · `/admin/settings` ★ · `/admin/team` ★ · `/admin/reports` ★

**API** — `src/app/api/`

| Route | Method | Notes |
|---|---|---|
| `auth/[...all]` | GET/POST | Better Auth handler. Sign-up disabled; users are created by seed or `/admin/team` |
| `availability` | GET | `?offering=&from=&to=` → free `{resourceId,startAt,endAt}[]`. Rate-limited, short cache |
| `webhooks/[provider]` | POST | `paymongo` / `stripe`. Raw body → verify → idempotent → state machine |
| `inngest` | GET/POST/PUT | Inngest serve handler |
| `admin/reports/export` | GET | ADMIN. CSV stream |

**Server actions** (validate → delegate → revalidate): `createBookingAction`, `lookupBookingAction`, and one module per admin area.

`src/proxy.ts` (Next 16's replacement for middleware) handles the CSP nonce and a cheap cookie-presence redirect for `/admin`. **Authorization is enforced in layouts, actions and data functions**, never only in the proxy.

---

## 7. Folder layout (additions to CLAUDE.md in bold)

```
src/app/(public)/ (auth)/ (admin)/admin/ api/
src/components/ui/            Button Field Card Table Badge Dialog Stepper
src/components/booking/       stepper steps, calendar, slot picker
src/components/admin/
src/lib/                      money dates intervals windows slots pricing booking-status reference-code validation csv
src/server/data/              db.ts bookings availability catalog hours pricing blocked payments settings rate-limit reports users
src/server/actions/
src/server/payments/          provider.ts paymongo.ts stripe.ts index.ts (env picks the provider; null provider when unset)
src/server/email/             templates/*.tsx send.ts (no-op without RESEND_API_KEY)
src/server/inngest/           client.ts functions/{sweep-holds,send-reminders,prune-rate-limits}.ts
src/server/session.ts         requireStaff / requireAdmin
src/generated/prisma/         (gitignored)
src/proxy.ts
prisma/                       schema.prisma migrations/ seed.ts seeds/{resort,court,salon}.ts
prisma.config.ts
reserva.config.ts
```

---

## 8. Changes I'd make to CLAUDE.md

Ordered by impact. The first five are correctness or security issues. The rest are refinements.

1. **The buffer isn't enforced by the DB.** `span = [start_at, end_at)` ignores `bufferMin`. Two concurrent SLOT bookings inside each other's buffer would both pass the exclusion constraint. → Add `occupied_until = end_at + buffer` and build `span` from it. `end_at` stays the customer-facing end time. (`timestamptz + interval` isn't immutable, so a generated column can't add the buffer itself; the server computes it.)

2. **An exclusion constraint on `blocked_periods` enforces the wrong rule.** Overlapping blocks are harmless. What matters is that bookings don't overlap blocks, and that's a cross-table rule. → A GiST index on blocks, plus the two triggers in §2.3 sharing a per-resource advisory lock, both raising 23P01. Also: `resourceId = null` means the whole business is closed.

3. **15-minute holds vs Stripe.** A Stripe Checkout Session's `expires_at` must be at least 30 minutes out, so a customer can pay after the hold expired. That can happen with PayMongo too. → Make `holdMinutes` a setting (default 15 for PayMongo, 30 for Stripe). Add a webhook-only `EXPIRED → CONFIRMED` transition: if the slot is still free the booking is confirmed; otherwise the payment is recorded and shown under "needs refund" in the admin dashboard.

4. **`/book/[ref]` leaks PII by reference code alone.** `RSV-XXXXX` has about 28M combinations and is meant to be read aloud, so it isn't a secret. → The confirmation URL carries a random 32-byte token, and only its sha256 is stored. `/lookup` (ref + email, rate-limited) reissues the link.

5. **Staff-created bookings don't fit the state machine.** With a mandatory 15-min hold, a message booking with pay-on-arrival would expire. → `initialStatus(source)`: ONLINE → PENDING_PAYMENT with a hold; WALK_IN/MESSAGE → CONFIRMED, or PENDING_PAYMENT with no hold. A CHECK constraint enforces that online holds exist.

6. **Offering fields.** Add `includedGuests` (the extra-guest fee needs a threshold), `slotStepMin` (a 45-min haircut on a 15-min grid), `bufferMin` for both modes (villa cleaning between Overnight and Day Tour), and `slug`. Store window times as integer minutes. `endsNextDay` is derivable; keep it but make it CHECK-enforced.

7. **Pricing overrides need date ranges.** Holy Week is several days. → `startDate`/`endDate` inclusive, optional `resourceId` and `offeringId`, most specific wins. Snapshot the quote on the booking (`priceBreakdown`) so later price edits don't rewrite history.

8. **Add-ons.** They're in the pricing pipeline but have no model. → Drop them from v1. `quote()` returns line items, so they can be added later without changing callers.

9. **Missing pieces.** A `RateLimit` table; Better Auth's `Account`/`Verification`; `User.disabledAt`; a `/admin/team` page (sign-up is disabled, so ADMIN needs a way to add and disable staff); `/admin/pricing` for overrides; `Booking.reminderSentAt` (idempotent reminders); `customerNotes` vs `internalNotes` (staff notes must never show on lookup).

10. **Reminder timing.** Inngest crons are fixed at deploy time, but the timezone comes from `Settings`. → Run hourly and send where it's 09:00 local and `reminderSentAt IS NULL`.

11. **Config vs Settings precedence.** State it explicitly: `Settings` (DB) is the runtime source of truth and ADMIN edits it. `reserva.config.ts` holds build-time things (fonts, OG fallback, preset, feature flags) and **seeds** `Settings`.

12. **Prisma 7 / Neon specifics** (for CLAUDE.md's Stack section). URLs move out of `schema.prisma` into `prisma.config.ts`. The Neon Marketplace integration sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct). Use the latter for migrations. The generated client goes to `src/generated/prisma` (gitignored).

13. **Timezone library.** Add `@date-fns/tz` (+ `date-fns`) for zone conversion. Native Temporal isn't something to rely on across Vercel runtimes yet.

14. **Provider/currency guard.** PayMongo is PHP-only. At startup, fail fast if `PAYMENT_PROVIDER=paymongo` and `Settings.currency ≠ PHP`. Webhooks also check amount and currency against `depositAmount` before confirming.

15. **Out of scope for v1** (to write in the README): refunds through the provider API, rescheduling, multi-resource bookings (villa + hall in one booking), add-ons, customer accounts.
