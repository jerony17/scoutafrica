-- Migration: paystack_atomic_charge_and_cancellation
--
-- Replaces the application-level, multi-round-trip Paystack charge/
-- cancellation logic in app/api/paystack/webhook/handlers.ts with two
-- atomic, SECURITY DEFINER Postgres functions. This closes correctness
-- gaps a multi-round review found in the application-level version:
-- a renewal-concurrency race (two deliveries could both read a
-- subscription's expires_at before either wrote it, double-extending
-- access), a write-before-detect bug in cancellation's ambiguous-match
-- handling (the UPDATE ran before the row count was checked), and no
-- protection against two different subscriptions claiming the same
-- Paystack identifier.
--
-- Named with a real 14-digit timestamp (not a bare sequence number like
-- "049") so this migration's version sorts correctly, after every
-- already-applied remote version, under the Supabase CLI's own lexical
-- version comparison (confirmed via direct reading of the CLI's
-- migration-pending.ts source earlier in this review) - independent of
-- the separate, pre-existing 045-048 local/remote naming mismatch, which
-- this migration does not attempt to fix. Filename-independent for the
-- MCP apply_migration path, which tracks its own server-side ledger.
--
-- Does not reference or depend on migration 048's
-- reconcile_paystack_pending_events in any way - 048 may be applied
-- before, after, or never, without affecting this migration's
-- correctness. The application layer continues to call
-- reconcile_paystack_pending_events separately after a successful charge,
-- unchanged.
--
-- advisory lock convention: pg_advisory_xact_lock(1, hashtext(subscription_code))
-- always acquired before pg_advisory_xact_lock(2, hashtext(customer_code)) -
-- a fixed ROLE TAG (1 vs 2), not a hash, so these two lock classes can
-- never collide with each other regardless of hashtext's output. Both
-- functions acquire all relevant advisory locks before any row access,
-- making a deadlock between them structurally impossible. This convention
-- is NOT (yet) adopted by reconcile_paystack_pending_events (048) -
-- confirmed, by direct test, that the only consequence of that gap is a
-- transient "unknown subscription" error on a cancellation that happens
-- to race an in-flight reconciliation, resolved automatically on Paystack's
-- own webhook retry; never an incorrect final state.

CREATE OR REPLACE FUNCTION public.apply_paystack_charge_success(
  p_reference text,
  p_amount numeric,
  p_currency text,
  p_payment_method text,
  p_user_id uuid DEFAULT NULL,
  p_billing_cycle text DEFAULT NULL,
  p_subscription_code text DEFAULT NULL,
  p_customer_code text DEFAULT NULL
)
RETURNS TABLE(applied boolean, subscription_id bigint, new_expires_at timestamptz, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id bigint;
  v_prior_expires_at timestamptz;
  v_billing_cycle text;
  v_currency text;
  v_payment_history_id bigint;
  v_existing_sub_id bigint;
  v_existing_amount numeric;
  v_existing_currency text;
  v_count_by_code integer := 0;
  v_count_by_customer integer := 0;
  v_id_by_code bigint;
  v_id_by_customer bigint;
  v_owner_count integer;
  v_owner_id bigint;
  v_existing_sub_code text;
  v_existing_cust_code text;
BEGIN
  -- Input validation first, before any lock or row access.
  IF p_reference IS NULL OR btrim(p_reference) = '' THEN
    RAISE EXCEPTION 'apply_paystack_charge_success requires a non-blank p_reference';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'apply_paystack_charge_success requires a positive p_amount';
  END IF;
  -- Matches app/api/paystack/initialize/route.ts's own PAYSTACK_SUPPORTED
  -- allowlist (NGN, USD only) - not pricing.ts's broader, cross-provider
  -- SupportedCurrency type, which also covers Stripe-only currencies this
  -- app never actually sends to Paystack. NULL is allowed to pass this
  -- generic check; whether NULL is acceptable depends on which branch
  -- below runs.
  IF p_currency IS NOT NULL AND p_currency NOT IN ('NGN','USD') THEN
    RAISE EXCEPTION 'Unsupported currency: %', p_currency;
  END IF;
  IF p_payment_method IS NULL OR btrim(p_payment_method) = '' THEN
    RAISE EXCEPTION 'apply_paystack_charge_success requires a non-blank p_payment_method';
  END IF;
  IF p_user_id IS NULL AND p_subscription_code IS NULL AND p_customer_code IS NULL THEN
    RAISE EXCEPTION 'apply_paystack_charge_success requires p_user_id or an identifier';
  END IF;

  -- Advisory locks, fixed role order, before any row access or creation.
  IF p_subscription_code IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(1, hashtext(p_subscription_code));
  END IF;
  IF p_customer_code IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(2, hashtext(p_customer_code));
  END IF;

  IF p_user_id IS NOT NULL AND p_billing_cycle IS NOT NULL THEN
    -- First-time activation (or an explicit reactivation with a known
    -- plan): safe to create-or-claim by user_id. No existing row to fall
    -- back on, so currency must be explicit.
    IF p_billing_cycle NOT IN ('monthly','annual') THEN
      RAISE EXCEPTION 'Invalid billing_cycle: %', p_billing_cycle;
    END IF;
    IF p_currency IS NULL THEN
      RAISE EXCEPTION 'First-time activation requires an explicit, supported currency';
    END IF;
    v_billing_cycle := p_billing_cycle;
    v_currency := p_currency;

    INSERT INTO subscriptions (user_id, updated_at)
    VALUES (p_user_id, now())
    ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
    RETURNING id, expires_at INTO v_subscription_id, v_prior_expires_at;
  ELSIF p_user_id IS NOT NULL THEN
    -- p_user_id given without p_billing_cycle. Not a confirmed real
    -- Paystack payload shape (metadata is either fully present, on our own
    -- initialize-time calls, or fully absent on Paystack-initiated renewal
    -- charges) but handled safely rather than assumed impossible: do not
    -- create a blank row - look up the EXISTING row by user_id (a clean,
    -- unique lookup) and derive billing_cycle and, if needed, currency
    -- from it, re-validating whatever is resolved.
    SELECT id, expires_at, billing_cycle, currency, paystack_subscription_code, paystack_customer_code
      INTO v_subscription_id, v_prior_expires_at, v_billing_cycle, v_currency, v_existing_sub_code, v_existing_cust_code
      FROM subscriptions WHERE user_id = p_user_id FOR UPDATE;

    IF v_subscription_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id given without billing_cycle, and no existing subscription to renew against';
    END IF;
    IF v_billing_cycle IS NULL THEN
      RAISE EXCEPTION 'Matched subscription (by user_id) has no stored billing_cycle to renew against';
    END IF;
    v_currency := coalesce(v_currency, p_currency);
    IF v_currency IS NULL OR v_currency NOT IN ('NGN','USD') THEN
      RAISE EXCEPTION 'No valid currency available for subscription % (resolved=%, supplied=%)', v_subscription_id, v_currency, p_currency;
    END IF;

    -- Identifier-consistency: an event reporting a DIFFERENT non-null code
    -- than what this row already has stored is a conflict, not a silent
    -- overwrite - distinct from the ownership check below (which guards
    -- against a DIFFERENT row already owning the code); this guards
    -- against THIS row's own identity being quietly reassigned.
    IF p_subscription_code IS NOT NULL AND v_existing_sub_code IS NOT NULL AND p_subscription_code <> v_existing_sub_code THEN
      RAISE EXCEPTION 'Event reports subscription_code % but subscription % already has % stored - refusing to overwrite',
        p_subscription_code, v_subscription_id, v_existing_sub_code;
    END IF;
    IF p_customer_code IS NOT NULL AND v_existing_cust_code IS NOT NULL AND p_customer_code <> v_existing_cust_code THEN
      RAISE EXCEPTION 'Event reports customer_code % but subscription % already has % stored - refusing to overwrite',
        p_customer_code, v_subscription_id, v_existing_cust_code;
    END IF;
  ELSE
    -- Renewal, resolved by Paystack's own identifiers. Never guess: zero
    -- matches, more-than-one matches, and disagreeing identifiers are all
    -- distinct, reported outcomes - none of them silently pick a row.
    IF p_subscription_code IS NOT NULL THEN
      SELECT count(*), max(id) INTO v_count_by_code, v_id_by_code
        FROM subscriptions WHERE paystack_subscription_code = p_subscription_code;
    END IF;
    IF p_customer_code IS NOT NULL THEN
      SELECT count(*), max(id) INTO v_count_by_customer, v_id_by_customer
        FROM subscriptions WHERE paystack_customer_code = p_customer_code;
    END IF;

    IF v_count_by_code > 1 OR v_count_by_customer > 1 THEN
      RAISE EXCEPTION 'More than one subscription row matched the same Paystack identifier';
    END IF;
    IF v_id_by_code IS NOT NULL AND v_id_by_customer IS NOT NULL AND v_id_by_code <> v_id_by_customer THEN
      RAISE EXCEPTION 'Paystack subscription_code and customer_code resolved to different subscription rows';
    END IF;

    v_subscription_id := coalesce(v_id_by_code, v_id_by_customer);
    IF v_subscription_id IS NULL THEN
      RAISE EXCEPTION 'Paystack charge.success had no usable metadata and matched no existing subscription';
    END IF;

    SELECT expires_at, billing_cycle, currency, paystack_subscription_code, paystack_customer_code
      INTO v_prior_expires_at, v_billing_cycle, v_currency, v_existing_sub_code, v_existing_cust_code
      FROM subscriptions WHERE id = v_subscription_id FOR UPDATE;

    IF v_billing_cycle IS NULL THEN
      RAISE EXCEPTION 'Matched subscription has no stored billing_cycle to renew against';
    END IF;
    v_currency := coalesce(v_currency, p_currency);
    IF v_currency IS NULL OR v_currency NOT IN ('NGN','USD') THEN
      RAISE EXCEPTION 'No valid currency available for subscription % (resolved=%, supplied=%)', v_subscription_id, v_currency, p_currency;
    END IF;

    IF p_subscription_code IS NOT NULL AND v_existing_sub_code IS NOT NULL AND p_subscription_code <> v_existing_sub_code THEN
      RAISE EXCEPTION 'Event reports subscription_code % but subscription % already has % stored - refusing to overwrite',
        p_subscription_code, v_subscription_id, v_existing_sub_code;
    END IF;
    IF p_customer_code IS NOT NULL AND v_existing_cust_code IS NOT NULL AND p_customer_code <> v_existing_cust_code THEN
      RAISE EXCEPTION 'Event reports customer_code % but subscription % already has % stored - refusing to overwrite',
        p_customer_code, v_subscription_id, v_existing_cust_code;
    END IF;
  END IF;

  -- Identifier-ownership check, uniform across every path above: having
  -- resolved/locked v_subscription_id, confirm neither identifier this
  -- call is about to write is already assigned to a DIFFERENT row. The
  -- advisory locks above serialize two concurrent claims for the same
  -- value; this check is what makes the second one to proceed actually
  -- reject the claim instead of silently overwriting the first's mapping.
  IF p_subscription_code IS NOT NULL THEN
    SELECT count(*), max(id) INTO v_owner_count, v_owner_id
      FROM subscriptions WHERE paystack_subscription_code = p_subscription_code AND id <> v_subscription_id;
    IF v_owner_count > 0 THEN
      RAISE EXCEPTION 'Paystack subscription_code % is already assigned to a different subscription (id=%)', p_subscription_code, v_owner_id;
    END IF;
  END IF;
  IF p_customer_code IS NOT NULL THEN
    SELECT count(*), max(id) INTO v_owner_count, v_owner_id
      FROM subscriptions WHERE paystack_customer_code = p_customer_code AND id <> v_subscription_id;
    IF v_owner_count > 0 THEN
      RAISE EXCEPTION 'Paystack customer_code % is already assigned to a different subscription (id=%)', p_customer_code, v_owner_id;
    END IF;
  END IF;

  -- Atomic idempotency claim, BEFORE any extension is written. A genuine
  -- retry of an already-applied charge is caught here and returns a
  -- benign no-op, never a second extension.
  INSERT INTO payment_history (subscription_id, payment_provider, payment_method, amount, currency, transaction_reference, payment_status, payment_date)
  VALUES (v_subscription_id, 'paystack', p_payment_method, p_amount, v_currency, p_reference, 'success', now())
  ON CONFLICT (payment_provider, transaction_reference) DO NOTHING
  RETURNING id INTO v_payment_history_id;

  IF v_payment_history_id IS NULL THEN
    -- A conflicting reference is only ever a benign duplicate if it
    -- belongs to the SAME subscription with the SAME amount/currency -
    -- never silently accepted otherwise.
    SELECT payment_history.subscription_id, payment_history.amount, payment_history.currency
      INTO v_existing_sub_id, v_existing_amount, v_existing_currency
      FROM payment_history
      WHERE payment_history.payment_provider = 'paystack' AND payment_history.transaction_reference = p_reference;

    IF v_existing_sub_id IS DISTINCT FROM v_subscription_id
       OR v_existing_amount IS DISTINCT FROM p_amount
       OR v_existing_currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION 'Paystack reference % already recorded with different subscription or payment details (existing subscription_id=%, amount=%, currency=%; this call: subscription_id=%, amount=%, currency=%)',
        p_reference, v_existing_sub_id, v_existing_amount, v_existing_currency, v_subscription_id, p_amount, v_currency;
    END IF;

    RETURN QUERY SELECT false, v_subscription_id, v_prior_expires_at, 'duplicate_reference'::text;
    RETURN;
  END IF;

  -- Extends from whichever is later: "now" for a first-time activation, or
  -- the existing expiry for a renewal, so a renewal landing a few days
  -- early can't shorten the period it's renewing; a very-late renewal
  -- can't backdate a lapsed period either.
  UPDATE subscriptions SET
    plan = CASE WHEN v_billing_cycle = 'monthly' THEN 'premium_monthly' ELSE 'premium_annual' END,
    billing_cycle = v_billing_cycle,
    amount = p_amount,
    currency = v_currency,
    payment_provider = 'paystack',
    payment_method = p_payment_method,
    transaction_id = p_reference,
    paystack_customer_code = coalesce(p_customer_code, paystack_customer_code),
    paystack_subscription_code = coalesce(p_subscription_code, paystack_subscription_code),
    status = 'premium',
    expires_at = GREATEST(coalesce(v_prior_expires_at, now()), now())
                 + (CASE WHEN v_billing_cycle = 'monthly' THEN interval '1 month' ELSE interval '1 year' END),
    cancelled_at = NULL,
    updated_at = now(),
    -- Switching provider to Paystack - clear fields that only ever applied
    -- to a prior Stripe subscription on this same row.
    stripe_subscription_id = NULL, stripe_customer_id = NULL, price_id = NULL
  WHERE id = v_subscription_id
  RETURNING expires_at INTO v_prior_expires_at;

  RETURN QUERY SELECT true, v_subscription_id, v_prior_expires_at, 'applied'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_paystack_charge_success(text, numeric, text, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_paystack_charge_success(text, numeric, text, text, uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_paystack_charge_success(text, numeric, text, text, uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paystack_charge_success(text, numeric, text, text, uuid, text, text, text) TO service_role;

-- subscription.disable means the subscription is disabled now; not_renew
-- means the already-paid current period continues and only the NEXT
-- auto-renewal is turned off. The mapping below is the single source of
-- truth for this distinction - a caller can no longer pass an
-- inconsistent (status, cancelled_at) pair, because there is no free-form
-- status parameter at all, only the Paystack event_type itself.
CREATE OR REPLACE FUNCTION public.apply_paystack_subscription_status(
  p_subscription_code text,
  p_event_type text
)
RETURNS TABLE(updated_id bigint, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_id bigint;
  v_status text;
  v_set_cancelled_at boolean;
BEGIN
  IF p_subscription_code IS NULL OR btrim(p_subscription_code) = '' THEN
    RAISE EXCEPTION 'apply_paystack_subscription_status requires a non-blank p_subscription_code';
  END IF;

  CASE p_event_type
    WHEN 'subscription.disable' THEN
      v_status := 'cancelled';
      v_set_cancelled_at := true;
    WHEN 'subscription.not_renew' THEN
      v_status := 'renewing';
      v_set_cancelled_at := false;
    ELSE
      RAISE EXCEPTION 'Unsupported Paystack event_type for apply_paystack_subscription_status: %', p_event_type;
  END CASE;

  PERFORM pg_advisory_xact_lock(1, hashtext(p_subscription_code));

  -- Count BEFORE writing, so an ambiguous match is detected before any
  -- row is touched - not merely reported after the fact.
  SELECT count(*), max(id) INTO v_count, v_id
    FROM subscriptions WHERE paystack_subscription_code = p_subscription_code;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No subscription row matched this Paystack subscription_code';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'More than one subscription row matched this Paystack subscription_code';
  END IF;

  PERFORM id FROM subscriptions WHERE id = v_id FOR UPDATE;

  UPDATE subscriptions SET
    status = v_status,
    cancelled_at = CASE WHEN v_set_cancelled_at THEN now() ELSE cancelled_at END,
    updated_at = now()
  WHERE id = v_id;

  RETURN QUERY SELECT v_id, v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_paystack_subscription_status(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_paystack_subscription_status(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_paystack_subscription_status(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_paystack_subscription_status(text, text) TO service_role;
