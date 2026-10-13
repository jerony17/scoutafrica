-- Migration: paystack_not_renew_state_guard
--
-- Closes a cancellation event-ordering gap in
-- apply_paystack_subscription_status (migration
-- 20261004133306_paystack_atomic_charge_and_cancellation.sql): the
-- function applied subscription.not_renew unconditionally, so a
-- subscription.not_renew arriving AFTER the row was already 'cancelled'
-- moved it back to 'renewing' - and is_user_premium() (028) treats
-- 'renewing' as premium until expires_at, silently restoring access.
--
-- Realistic trigger, not only a retry edge case: the Paystack branch of
-- app/api/subscription/cancel/route.ts calls Paystack's
-- /subscription/disable and then sets 'cancelled' locally right away; for
-- a still-active subscription Paystack's documented response to that call
-- is a subscription.not_renew event, which then arrives after 'cancelled'.
--
-- Fix: not_renew only ever narrows an ACTIVE subscription ('premium' or
-- 'renewing') to "ends at period end". From any other status it is a
-- benign no-op that still returns exactly one row (the current status), so
-- the webhook handler acknowledges it with a 200 rather than a 500 that
-- Paystack would keep retrying. subscription.disable is unchanged.
-- Immediate cancellation behavior is preserved: once 'cancelled', a row
-- stays 'cancelled' until a new charge.success reactivates it.
--
-- Same signature and return type as before, so CREATE OR REPLACE is a
-- drop-in replacement; the applied 20261004133306 migration is not edited.

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
  v_current_status text;
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

  SELECT status INTO v_current_status FROM subscriptions WHERE id = v_id FOR UPDATE;

  -- not_renew must never resurrect a cancelled/expired/free row (late or
  -- retried delivery, or the app's own cancel route having already set
  -- 'cancelled'). Benign no-op: nothing written, still exactly one row.
  IF p_event_type = 'subscription.not_renew'
     AND v_current_status NOT IN ('premium', 'renewing') THEN
    RETURN QUERY SELECT v_id, v_current_status;
    RETURN;
  END IF;

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
