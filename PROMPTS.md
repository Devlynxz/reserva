# Reserva — Claude Code prompts

Paste one phase at a time. Test and commit before moving on. `CLAUDE.md` must be in the project root.

**Accounts (free tiers):** GitHub, Vercel, Neon (via Vercel Marketplace), PayMongo test mode, Stripe test mode, Resend, Inngest. Sentry optional.

---

## Phase 0 — Plan

```
Read CLAUDE.md. Use my KitaFlux repo (github.com/Devlynxz/KitaFlux) as the
quality bar. Before writing code, give me: the phase plan, the full Prisma
schema + hand-written SQL (btree_gist, generated span column, exclusion
constraints), the route map, the lib/ modules with their tests, and how WINDOW
and SLOT modes share one booking path. Flag anything in CLAUDE.md you'd change.
No code yet.
```

## Phase 1 — Scaffold

```
Scaffold per CLAUDE.md: Next.js 16 App Router, strict TS, Tailwind v4, ESLint,
Vitest, Prisma 7 + @prisma/adapter-pg, Better Auth (email/password + role),
zod, decimal.js. Folder structure from CLAUDE.md. .env.example documenting every
variable (required vs optional). reserva.config.ts for branding. A design system
in components/ui (Button, Field, Card, Table, Badge, Dialog, Stepper) with
brand color tokens, light/dark. Confirm typecheck, lint, test, build pass.
Commit.
```

## Phase 2 — Domain logic

```
Build pure lib/ modules with full Vitest coverage: money (Decimal, currency-aware,
ROUND_HALF_UP), windows (WINDOW offering + date -> startAt/endAt in the business
timezone), slots (SLOT grid from business hours, duration, buffer, existing
bookings), pricing (base, weekend, overrides, extra guests, deposit),
booking-status (transition table), reference-code (RSV-7K3Q9, no ambiguous
chars), validation (zod). Commit.
```

## Phase 3 — Database

```
Write the Prisma schema and migrations per CLAUDE.md, including hand-written SQL
for the exclusion constraints on bookings and blocked periods. Build
server/data/* and the createBooking transaction (lazy hold expiry, "any staff"
assignment, 23P01 handling). Seed presets via SEED_PRESET: resort (Main Pool
Villa, Kubo Cottage, Function Hall; Day Tour / Overnight / 22 Hours; Holy Week
override), court (4 pickleball courts, 60-min slots), salon (3 stylists, 5
services). Each preset: 1 admin, 1 staff, ~15 bookings over 60 days.
Write the DB tests from CLAUDE.md including the 20-way race. Commit.
```

## Phase 4 — Public site & booking flow

```
Build the public side, mobile-first: landing (hero, offerings, amenities,
location, FAQ, contact, Book now), availability calendar (WINDOW) and time-slot
picker (SLOT), booking stepper (offering + resource/staff + date/time -> customer
details -> review with server-computed price -> pay deposit), confirmation page,
/lookup by reference + email. Rate-limit create and lookup. SEO metadata + Open
Graph image. Commit.
```

## Phase 5 — Payments, email, jobs

```
Implement the payment provider interface with PayMongo (GCash, Maya, card) and
Stripe, both test mode. Webhook route per provider: raw-body signature check,
idempotent by providerEventId, confirm through the state machine, record
Payment. Resend react-email templates: received, confirmed, reminder (24h
before), cancelled. Inngest: hold-expiry sweep every 5 min, daily reminders at
09:00 business time. Everything degrades gracefully without keys. Explain how to
register both webhooks and test locally. Commit.
```

## Phase 6 — Admin

```
Build /admin (ADMIN full; STAFF no settings/reports): dashboard (today's
bookings, upcoming, month revenue + occupancy), calendar (month/week per
resource), bookings list + detail (record cash payment, cancel, no-show,
complete, notes, event timeline), manual walk-in/message booking via the same
createBooking, CRUD for resources, offerings, hours, overrides, blocked periods,
settings, and a monthly report with CSV export (formula-injection safe). Commit.
```

## Phase 7 — Polish

```
Senior review: accessibility, 375px layouts, empty/error states, CSP with nonce
like KitaFlux, Sentry scrubbing, lazy-loaded admin. Add a demo banner and demo
admin login. README in KitaFlux style: problem, stack, architecture, "The parts
worth reading" (exclusion constraint, lazy holds, webhook-only confirmation,
pricing), tests table, deploying, and "Launching for a new client". Commit.
```

## Phase 8 — Deploy to Vercel

```
Prepare production: build script runs prisma generate; migrations run with
prisma migrate deploy against the direct Neon URL; list every Vercel env var;
set BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL to the vercel.app domain; register
webhook URLs; connect Inngest to /api/inngest; create a Vercel Blob store.
Give me a step-by-step checklist and run a production build locally.
```

Then: push to GitHub → Vercel **Add New Project** → import → **Storage → Neon** (DATABASE_URL auto-set) → add remaining env vars → **Deploy**.
