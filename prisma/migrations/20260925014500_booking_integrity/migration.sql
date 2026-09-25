-- Booking integrity: the rules Prisma can't express. Hand-written; see docs/PLAN.md §2.3.
--
-- 1. Invariants as CHECK constraints (settings singleton, offering mode fields, money ≥ 0, …).
-- 2. bookings.span (generated) + an exclusion constraint: no two ACTIVE bookings on the same
--    resource may overlap, turnover buffer included. This is what prevents double bookings.
-- 3. blocked_periods.span (generated) + triggers that keep bookings and blocks apart.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Singleton & catalog invariants ──────────────────────────────────────────

ALTER TABLE settings
  ADD CONSTRAINT settings_singleton   CHECK (id = 1),
  ADD CONSTRAINT settings_deposit_pct CHECK (deposit_percent > 0 AND deposit_percent <= 100),
  ADD CONSTRAINT settings_hold        CHECK (hold_minutes BETWEEN 5 AND 1440),
  ADD CONSTRAINT settings_currency    CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT settings_horizon     CHECK (lead_time_min >= 0 AND max_advance_days >= 1),
  ADD CONSTRAINT settings_weekend     CHECK (weekend_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]);

ALTER TABLE offerings
  ADD CONSTRAINT offerings_mode_fields CHECK (
    (mode = 'WINDOW'
       AND start_minute BETWEEN 0 AND 1439
       AND end_minute   BETWEEN 0 AND 1439
       AND ends_next_day = (end_minute <= start_minute)   -- the flag must agree with the times
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
-- It covers the trailing buffer, so turnover time is enforced by the database too.
-- (A generated column can't add the buffer itself: timestamptz + interval isn't
-- immutable, so the server stores occupied_until = end_at + buffer.)

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
  -- Online holds must expire; staff-created "awaiting payment" bookings may not.
  ADD CONSTRAINT bookings_online_hold CHECK (
    NOT (status = 'PENDING_PAYMENT' AND source = 'ONLINE' AND hold_expires_at IS NULL)
  );

-- Must match ACTIVE_STATUSES in src/lib/booking-status.ts.
ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (resource_id WITH =, span WITH &&)
  WHERE (status IN ('PENDING_PAYMENT', 'CONFIRMED'));

-- ── Blocked periods: generated span + GiST index ────────────────────────────
-- Overlapping blocks are harmless, so there's no self-exclusion. The rule that matters,
-- "no active booking inside a block", spans two tables, so triggers enforce it below.

ALTER TABLE blocked_periods DROP COLUMN span;
ALTER TABLE blocked_periods
  ADD COLUMN span tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;
ALTER TABLE blocked_periods
  ADD CONSTRAINT blocked_periods_time_order CHECK (start_at < end_at);
-- span only: Prisma can declare this one (a uuid column in a GiST index needs btree_gist
-- operator classes Prisma has no syntax for). The table stays small; resource_id filters after.
CREATE INDEX blocked_periods_span_idx ON blocked_periods USING gist (span);

-- ── Cross-table guard: bookings × blocked periods ───────────────────────────
-- Both sides take the same per-resource transaction-scoped advisory lock, so a booking and
-- a block can't commit into the same time concurrently. Violations raise SQLSTATE 23P01
-- (exclusion_violation) like the constraint does, so the app has a single error path. The
-- message starts with the constraint name because Prisma's pg adapter drops the error's
-- `constraint` field. Locks are always taken in ascending id order.

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
    RAISE EXCEPTION 'bookings_blocked_period: requested time overlaps a blocked period'
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
    RAISE EXCEPTION 'blocked_periods_overlap_bookings: active bookings exist in this period'
      USING ERRCODE = 'exclusion_violation', CONSTRAINT = 'blocked_periods_overlap_bookings';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER blocked_periods_guard_bookings
  BEFORE INSERT OR UPDATE OF resource_id, start_at, end_at ON blocked_periods
  FOR EACH ROW EXECUTE FUNCTION blocked_periods_guard_bookings();
