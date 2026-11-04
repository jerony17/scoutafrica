-- Migration: 050_paypal_refunds_and_reversals
--
-- APPLIED to the TEST project (gdoadajmggmawiiyoaus) on 2026-11-04 via
-- apply_migration. NOT applied to production. Must be applied
-- (test project first, then production) BEFORE the refund/reversal webhook
-- code that writes these values is deployed - otherwise those events fail
-- with a CHECK / missing-table error and PayPal keeps redelivering them
-- (access is still revoked first, so a full refund is not lost, but no
-- audit row is written and the payment status is not updated).
--
-- What it does (additive only - no existing row is updated or deleted):
--   1. Allows 'partially_refunded' and 'reversed' in
--      payment_history.payment_status (keeps success, failed, pending,
--      refunded), so a partial refund and a chargeback are recorded
--      distinctly from a full refund.
--   2. Creates public.paypal_refund_events: one row per PayPal
--      PAYMENT.SALE.REFUNDED / REVERSED event id - what was decided
--      (access_revoked / partial_refund_access_retained / needs_review),
--      whether PayPal confirmed the subscription cancellation, and why a
--      case needs a human. This is the review queue:
--        SELECT * FROM public.paypal_refund_events
--        WHERE outcome = 'needs_review' OR paypal_cancellation = 'pending';
--      RLS enabled with no policies: service role only (webhook + admin SQL).
--
-- Safety design (same approach as 049):
--   - ONE statement (a single DO block): applies completely or not at all.
--   - EXACT status check: the live CHECK's allowed values are compared as a
--     set. It must be exactly {failed, pending, refunded, success} (then it
--     is replaced) or exactly that plus {partially_refunded, reversed}
--     (already done - left alone). Anything else aborts.
--   - If paypal_refund_events already exists it must have exactly the
--     planned columns; otherwise it aborts instead of silently skipping.
--   - Re-runnable: running it again after success changes nothing.
--
-- Not changed: subscriptions (its status CHECK already allows 'cancelled',
-- which is what a revocation writes), is_user_premium(), other providers'
-- rows, existing payment_history rows, RLS on existing tables.
--
-- Note for admin reporting: revenue totals in 028's admin functions count
-- payment_status = 'success' only, so partially refunded and reversed
-- payments drop out of them - the same treatment 'refunded' already gets.

DO $migration$
DECLARE
  n_checks int;
  con_name text;
  con_def text;
  allowed text[];
  cols text[];
BEGIN
  -- 1. payment_history.payment_status CHECK: exact-set comparison.
  SELECT count(*) INTO n_checks
  FROM pg_constraint c
  WHERE c.conrelid = 'public.payment_history'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%payment_status%';

  IF n_checks <> 1 THEN
    RAISE EXCEPTION 'public.payment_history: expected exactly 1 CHECK mentioning payment_status, found % - aborting', n_checks;
  END IF;

  SELECT c.conname, pg_get_constraintdef(c.oid) INTO con_name, con_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.payment_history'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%payment_status%';

  IF con_def !~* '^CHECK \(\(payment_status = ANY \(ARRAY\[[^]]*\]\)\)\)$' THEN
    RAISE EXCEPTION 'public.payment_history: payment_status CHECK % has an unexpected form: % - aborting', con_name, con_def;
  END IF;

  SELECT array_agg(m[1] ORDER BY m[1]) INTO allowed
  FROM regexp_matches(con_def, '''([^'']*)''', 'g') AS m;

  IF allowed = ARRAY['failed', 'partially_refunded', 'pending', 'refunded', 'reversed', 'success'] THEN
    RAISE NOTICE 'public.payment_history: % already allows partially_refunded and reversed - unchanged', con_name;
  ELSIF allowed = ARRAY['failed', 'pending', 'refunded', 'success'] THEN
    EXECUTE format('ALTER TABLE public.payment_history DROP CONSTRAINT %I', con_name);
    EXECUTE format(
      'ALTER TABLE public.payment_history ADD CONSTRAINT %I CHECK (payment_status IN (''success'', ''failed'', ''pending'', ''refunded'', ''partially_refunded'', ''reversed''))',
      con_name
    );
    RAISE NOTICE 'public.payment_history: % now also allows partially_refunded, reversed', con_name;
  ELSE
    RAISE EXCEPTION 'public.payment_history: payment_status CHECK % allows %, expected exactly {failed, pending, refunded, success} - aborting',
      con_name, allowed;
  END IF;

  -- 2. Refund/reversal event log + review queue.
  IF to_regclass('public.paypal_refund_events') IS NULL THEN
    CREATE TABLE public.paypal_refund_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      paypal_event_id text NOT NULL UNIQUE,
      event_type text NOT NULL CHECK (event_type IN ('PAYMENT.SALE.REFUNDED', 'PAYMENT.SALE.REVERSED')),
      sale_id text,
      paypal_subscription_id text,
      subscription_id bigint REFERENCES public.subscriptions (id) ON DELETE SET NULL,
      outcome text NOT NULL CHECK (outcome IN ('access_revoked', 'partial_refund_access_retained', 'needs_review')),
      paypal_cancellation text NOT NULL CHECK (paypal_cancellation IN ('not_required', 'confirmed', 'pending')),
      review_reason text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX paypal_refund_events_open_idx
      ON public.paypal_refund_events (created_at)
      WHERE outcome = 'needs_review' OR paypal_cancellation = 'pending';

    ALTER TABLE public.paypal_refund_events ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.paypal_refund_events FROM anon, authenticated;
  ELSE
    SELECT array_agg(column_name::text ORDER BY column_name) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'paypal_refund_events';

    IF cols <> ARRAY['created_at', 'event_type', 'id', 'outcome', 'paypal_cancellation', 'paypal_event_id',
                     'paypal_subscription_id', 'review_reason', 'sale_id', 'subscription_id', 'updated_at'] THEN
      RAISE EXCEPTION 'public.paypal_refund_events already exists with different columns: % - aborting', cols;
    END IF;
    RAISE NOTICE 'public.paypal_refund_events already exists - unchanged';
  END IF;
END
$migration$;

-- Rollback (only while no payment_history row uses the new values):
--   DROP TABLE public.paypal_refund_events;
--   ALTER TABLE public.payment_history DROP CONSTRAINT <same name>;
--   ALTER TABLE public.payment_history ADD CONSTRAINT <same name>
--     CHECK (payment_status IN ('success', 'failed', 'pending', 'refunded'));
