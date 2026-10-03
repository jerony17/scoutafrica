-- Migration: 048_paystack_pending_events
--
-- Paystack's subscription.create and charge.success webhooks can arrive in
-- either order for the same plan-code transaction. charge.success reliably
-- carries metadata.user_id (we set it ourselves at /transaction/initialize),
-- so it's the only event that can identify which ScoutAfrica user a
-- subscription belongs to. subscription.create carries the actual
-- subscription_code we need to store, correlated only by the Paystack
-- customer code - no user_id, no email, no reference we've confirmed.
--
-- If subscription.create arrives BEFORE charge.success has had a chance to
-- write paystack_customer_code onto the right subscriptions row, there is
-- no legal row to update yet: subscriptions.user_id is NOT NULL, UNIQUE,
-- and foreign-keyed to auth.users (verified directly against this schema
-- before writing this migration) - a placeholder row with no known user_id
-- cannot be inserted there. This table exists purely to hold that one
-- event durably until charge.success can reconcile it, rather than
-- discarding it or guessing which user it belongs to via plan code,
-- timestamps, or "most recent row" heuristics.
--
-- IDENTITY: subscription_code is used as the primary key rather than an
-- invented synthetic event id - Paystack's documented subscription.create
-- payload (data.subscription_code) is the one genuinely Paystack-issued,
-- stable identifier confirmed to exist on this event, and it naturally
-- gives idempotency: a redelivered copy of the same event collides on the
-- same primary key instead of creating a duplicate staged row.
--
-- ACCESS: RLS enabled with no policies for anon/authenticated - default
-- deny, the same pattern as rate_limits (047) and every other
-- server-only table in this schema. Only service_role (used via
-- supabaseAdmin in the webhook handler, which bypasses RLS by Supabase
-- convention) can read or write this table.

CREATE TABLE IF NOT EXISTS public.paystack_pending_events (
  subscription_code text PRIMARY KEY,
  customer_code text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- Supports the reconciliation lookup in handleChargeSuccess: "is there a
-- staged event for the customer_code I just captured?"
CREATE INDEX IF NOT EXISTS idx_paystack_pending_events_customer_code
  ON public.paystack_pending_events (customer_code);

ALTER TABLE public.paystack_pending_events ENABLE ROW LEVEL SECURITY;
-- No policies added for anon/authenticated - default deny. Only
-- service_role touches this table, exclusively from the Paystack webhook
-- handler.

-- RECONCILIATION FUNCTION - revised twice from this migration's first
-- draft.
--
-- Draft 1: the webhook handler issued a separate, non-transactional
-- DELETE and then UPDATE from application code - a failure between them
-- could lose a staged event permanently. Fixed by moving both into one
-- plpgsql function (one Postgres transaction: a raised error rolls back
-- everything, including the DELETE).
--
-- Draft 2 (this one): draft 1's function still had a race. It read the
-- single "most recent" pending row with a plain SELECT, then deleted
-- EVERY pending row for that customer_code with a second, separately-
-- scoped DELETE. A subscription.create event staged in the window
-- between that SELECT and that DELETE - realistic, since staging also
-- triggers its own immediate reconcile attempt, so reconciliation runs
-- often - would be swept up and deleted by the blanket DELETE without
-- ever having been read or applied. Two changes fix this:
--
-- 1. LOCKING: `SELECT ... FOR UPDATE` on the matching subscriptions row,
--    before touching paystack_pending_events at all, serializes
--    concurrent reconcile calls for the SAME customer_code - a second
--    call blocks until the first transaction commits or rolls back. This
--    means only one reconciliation is ever actively reading or deleting
--    this customer's pending events at a time; there is no window where
--    two transactions can interleave their reads and deletes against the
--    same rows. A new event staged by a concurrent INSERT (staging is a
--    separate statement, not covered by this lock) simply isn't part of
--    this transaction's snapshot if it commits after this function's own
--    SELECT - and because deletes are now scoped per-row (see 2), that
--    new row is never touched by this invocation at all. It stays
--    staged, untouched, for the next reconcile attempt (which will
--    follow immediately, since staging itself always attempts a
--    reconcile right after inserting).
-- 2. PER-ROW PROCESSING: every currently-staged event for this customer
--    is processed in a loop, oldest first, each iteration applying that
--    event's subscription_code to the subscriptions row and ONLY THEN
--    deleting that exact row (DELETE ... WHERE subscription_code = the
--    one just applied). No blanket "delete everything for this
--    customer" exists anymore. A row is removed if and only if it was
--    actually applied, in the same transaction, immediately before its
--    deletion.
--
-- MULTIPLE PENDING EVENTS PER CUSTOMER, reconsidered: draft 1 applied
-- only the most recent event and discarded (deleted) every older one
-- unapplied - a permanent loss based on an unverified assumption that
-- "most recent" always reflects the user's real intent. This version
-- processes EVERY staged event for the customer in received_at order,
-- applying each in turn - nothing is discarded without being applied at
-- least once. Because later iterations overwrite the same subscriptions
-- row, the row's FINAL state after the loop is still whichever event was
-- received last (the same practical end state as before), but every
-- intermediate event was genuinely processed, not silently skipped, and
-- reconciled_count in the return value reports how many were handled in
-- this call so multiple-event situations are visible, not silent. This
-- does not resolve the deeper business question of which of several
-- genuinely conflicting subscription attempts the user actually wanted -
-- that remains a "last received wins" policy, now applied honestly
-- rather than by discarding evidence.
--
-- INVARIANT AND DEFENSIVE CHECK: this function assumes at most one
-- subscriptions row carries a given paystack_customer_code at any time -
-- nothing in the schema currently enforces that with a UNIQUE constraint,
-- only subscriptions.user_id is unique. If that invariant is ever
-- violated (e.g. by a future bug elsewhere, or manual data correction),
-- this function refuses to guess which row is correct: it raises an
-- exception, which rolls back the entire transaction (nothing applied,
-- nothing deleted, every pending event remains staged untouched) and
-- surfaces as an error the caller logs. Adding a UNIQUE constraint on
-- subscriptions.paystack_customer_code would prevent this situation from
-- arising at all, but that is a separate schema change outside this
-- bug-fix's scope - worth considering as a follow-up, not included here.
CREATE OR REPLACE FUNCTION public.reconcile_paystack_pending_events(p_customer_code text)
RETURNS TABLE(applied_subscription_code text, reconciled_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id public.subscriptions.id%TYPE;
  v_match_count integer;
  v_row record;
  v_applied_code text := NULL;
  v_count integer := 0;
BEGIN
  SELECT count(*) INTO v_match_count
  FROM public.subscriptions
  WHERE paystack_customer_code = p_customer_code;

  IF v_match_count = 0 THEN
    -- No subscriptions row carries this customer_code yet - charge.success
    -- for this transaction hasn't committed yet from this function's point
    -- of view. Leave every pending row untouched for a future attempt.
    RETURN QUERY SELECT NULL::text, 0;
    RETURN;
  END IF;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION
      'Multiple subscriptions rows share paystack_customer_code %; refusing to reconcile ambiguously',
      p_customer_code;
  END IF;

  -- Locks this specific row - see the locking note above for why this is
  -- what actually prevents concurrent reconcile calls from interleaving.
  SELECT id INTO v_subscription_id
  FROM public.subscriptions
  WHERE paystack_customer_code = p_customer_code
  FOR UPDATE;

  -- next_payment_date is cast directly inside the loop, with no
  -- fallback-on-malformed-value handling: if it fails to parse for any
  -- one event, the whole function raises and the entire transaction
  -- rolls back - every event processed so far in this call (even ones
  -- already applied+deleted earlier in the same loop) is rolled back
  -- too, leaving all of them staged for retry rather than applying a
  -- partial batch. Deliberately strict and all-or-nothing per call.
  FOR v_row IN
    SELECT subscription_code, payload
    FROM public.paystack_pending_events
    WHERE customer_code = p_customer_code
    ORDER BY received_at ASC
    FOR UPDATE
  LOOP
    UPDATE public.subscriptions
    SET
      paystack_subscription_code = v_row.subscription_code,
      expires_at = COALESCE(
        (v_row.payload->>'next_payment_date')::timestamptz,
        expires_at
      ),
      updated_at = now()
    WHERE id = v_subscription_id;

    DELETE FROM public.paystack_pending_events
    WHERE subscription_code = v_row.subscription_code;

    v_applied_code := v_row.subscription_code;
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_applied_code, v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_paystack_pending_events(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_paystack_pending_events(text) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_paystack_pending_events(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_paystack_pending_events(text) TO service_role;
