-- Migration: 047_rate_limits
--
-- SECURITY FIX (ScoutAfrica Security Release 5): shared, persistent
-- rate-limit state for the three server-side endpoints identified in the
-- security audit as unprotected against request-volume abuse:
--   - POST /api/support/tickets        (IP-based, 5 / 10 minutes)
--   - POST /api/paystack/initialize    (user-based, 5 / 1 minute)
--   - POST /api/stripe/create-checkout-session (user-based, 5 / 1 minute)
--
-- ARCHITECTURE: this app runs as Vercel Serverless Functions (confirmed
-- across every build this session - all API routes compile to "ƒ"), so
-- an in-memory counter would not be reliable (different invocations can
-- land on different, short-lived instances with independent memory).
-- Postgres is the only shared, persistent state already available in
-- this project's architecture - no new dependency, no new external
-- service, matching every prior security release's preference for using
-- what's already here.
--
-- CONCURRENCY SAFETY: a naive "SELECT count, then INSERT if below limit"
-- pattern race-conditions under concurrent requests (two requests can
-- both read the same pre-increment count and both proceed). This uses a
-- single atomic `INSERT ... ON CONFLICT (key, window_start) DO UPDATE
-- SET count = count + 1` statement instead - Postgres serializes
-- concurrent upserts to the same row internally, so the returned count
-- is always correct even under concurrent load. See
-- check_rate_limit() below.
--
-- FIXED WINDOWS, NOT SLIDING: window_start is the current time truncated
-- down to a multiple of the caller-supplied window length (e.g. every
-- distinct 60-second slice for a 1-minute window). All concurrent
-- requests within the same window compute the identical window_start
-- value, so they correctly collide on the same row via ON CONFLICT.
--
-- MINIMAL STORAGE: only what's required to enforce a count per
-- identifier per window - no request metadata, no timestamps beyond the
-- window boundary itself, no user-agent/path/etc. `key` is a caller-
-- constructed string (bucket + hashed identifier - hashing happens in
-- app/lib/rateLimit.ts before the IP or user id ever reaches this
-- table), not a raw IP address or raw user id column.
--
-- CLEANUP: no pg_cron (deliberately removed from this project - see
-- 027_remove_verification_expiry.sql's sibling migration history and
-- the general pattern of this schema avoiding scheduled jobs). Cleanup
-- instead piggybacks on check_rate_limit() itself: every call opportunistically
-- deletes rows older than 1 hour, which is generous headroom above the
-- longest window used (10 minutes) and keeps the table from growing
-- unbounded without any separate job/extension. The idx_rate_limits_window_start
-- index below makes that delete a cheap indexed range scan, not a
-- sequential scan.
--
-- ACCESS: RLS is enabled with NO policies for anon or authenticated -
-- default-deny, the same pattern already used elsewhere in this schema
-- when a table should have zero direct client access (e.g.
-- featured_player_slots' lack of an INSERT/DELETE policy). The only way
-- to read or write this table is the check_rate_limit() function below,
-- and EXECUTE on that function is explicitly revoked from anon/
-- authenticated/PUBLIC and granted only to service_role - the same
-- privilege-tightening this project already had to apply once before
-- (042_revoke_anon_is_verified_agent_execute.sql, after discovering this
-- project's schema-level default privileges otherwise auto-grant EXECUTE
-- to anon/authenticated on every new function). Applied proactively here
-- rather than as a follow-up fix.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies added for anon/authenticated - default deny. Only
-- service_role (which bypasses RLS by Supabase convention) and the
-- SECURITY DEFINER function below can touch this table.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_count integer
)
RETURNS TABLE(allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  -- Opportunistic cleanup - see migration header comment. Runs before the
  -- upsert so it never interferes with the row this call is about to
  -- touch (that row's window_start is always "now", never older than an
  -- hour).
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 hour';

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING public.rate_limits.count INTO v_count;

  RETURN QUERY SELECT
    v_count <= p_max_count,
    GREATEST(
      0,
      ceil(extract(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - now())))::integer
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
