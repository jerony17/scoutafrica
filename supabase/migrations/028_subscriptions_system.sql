-- Migration: 028_subscriptions_system
-- ScoutAfrica: Payment & Subscription System (MVP)
--
-- One subscription record per user (upserted as status changes), one
-- payment_history row per individual payment event. Mutations are NEVER
-- allowed directly from the client - only server-side webhook/API code
-- (using the Supabase service role key, which bypasses RLS) can write
-- here. Tested directly: a regular user attempting to insert their own
-- 'premium' row gets a genuine RLS violation.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid NOT NULL UNIQUE references auth.users(id) on delete cascade,
  account_type text,
  plan text CHECK (plan IN ('premium_monthly', 'premium_annual')),
  billing_cycle text CHECK (billing_cycle IN ('monthly', 'annual')),
  amount numeric,
  currency text,
  payment_provider text CHECK (payment_provider IN ('stripe', 'paystack')),
  payment_method text,
  transaction_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  paystack_customer_code text,
  paystack_subscription_code text,
  status text NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'premium', 'pending', 'cancelled', 'expired', 'renewing')),
  started_at timestamptz,
  expires_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON public.subscriptions (expires_at);

DROP POLICY IF EXISTS "Users can view their own subscription" ON public.subscriptions;
CREATE POLICY "Users can view their own subscription"
  ON public.subscriptions FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.subscriptions FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- Deliberately NO insert/update/delete policy for regular users at all.

CREATE TABLE IF NOT EXISTS public.payment_history (
  id bigint generated always as identity primary key,
  subscription_id bigint NOT NULL references public.subscriptions(id) on delete cascade,
  payment_provider text NOT NULL CHECK (payment_provider IN ('stripe', 'paystack')),
  payment_method text,
  amount numeric NOT NULL,
  currency text NOT NULL,
  transaction_reference text,
  payment_status text NOT NULL CHECK (payment_status IN ('success', 'failed', 'pending', 'refunded')),
  payment_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON public.payment_history (subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_payment_date ON public.payment_history (payment_date);

DROP POLICY IF EXISTS "Users can view their own payment history" ON public.payment_history;
CREATE POLICY "Users can view their own payment history"
  ON public.payment_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = payment_history.subscription_id AND s.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all payment history" ON public.payment_history;
CREATE POLICY "Admins can view all payment history"
  ON public.payment_history FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- === isPremium() as a real, callable helper ===
-- Public (anon + authenticated) so the Premium badge can be shown on
-- another user's public profile without exposing private payment
-- details - mirrors the get_club_public_stats pattern.
CREATE OR REPLACE FUNCTION public.is_user_premium(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = p_user_id
      AND status IN ('premium', 'renewing')
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_user_premium(uuid) TO anon, authenticated;

-- === Admin aggregate stats ===
CREATE OR REPLACE FUNCTION public.get_subscription_admin_stats()
RETURNS TABLE (
  total_premium_members bigint,
  monthly_subscribers bigint,
  annual_subscribers bigint,
  monthly_revenue numeric,
  annual_revenue numeric,
  total_revenue numeric,
  cancelled_count bigint,
  expired_count bigint,
  failed_payments bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF ((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM public.subscriptions WHERE status IN ('premium', 'renewing') AND (expires_at IS NULL OR expires_at > now())),
    (SELECT count(*) FROM public.subscriptions WHERE billing_cycle = 'monthly' AND status IN ('premium', 'renewing') AND (expires_at IS NULL OR expires_at > now())),
    (SELECT count(*) FROM public.subscriptions WHERE billing_cycle = 'annual' AND status IN ('premium', 'renewing') AND (expires_at IS NULL OR expires_at > now())),
    (SELECT COALESCE(sum(amount), 0) FROM public.payment_history WHERE payment_status = 'success' AND subscription_id IN (SELECT id FROM public.subscriptions WHERE billing_cycle = 'monthly')),
    (SELECT COALESCE(sum(amount), 0) FROM public.payment_history WHERE payment_status = 'success' AND subscription_id IN (SELECT id FROM public.subscriptions WHERE billing_cycle = 'annual')),
    (SELECT COALESCE(sum(amount), 0) FROM public.payment_history WHERE payment_status = 'success'),
    (SELECT count(*) FROM public.subscriptions WHERE status = 'cancelled'),
    (SELECT count(*) FROM public.subscriptions WHERE status = 'expired'),
    (SELECT count(*) FROM public.payment_history WHERE payment_status = 'failed');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_subscription_admin_stats() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_revenue_by_currency()
RETURNS TABLE (currency text, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF ((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT ph.currency, sum(ph.amount)
  FROM public.payment_history ph
  WHERE ph.payment_status = 'success'
  GROUP BY ph.currency
  ORDER BY sum(ph.amount) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_by_currency() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_revenue_by_provider()
RETURNS TABLE (payment_provider text, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF ((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT ph.payment_provider, sum(ph.amount)
  FROM public.payment_history ph
  WHERE ph.payment_status = 'success'
  GROUP BY ph.payment_provider
  ORDER BY sum(ph.amount) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_revenue_by_provider() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_payment_method_stats()
RETURNS TABLE (payment_method text, usage_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF ((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
  SELECT COALESCE(ph.payment_method, 'unknown'), count(*)
  FROM public.payment_history ph
  WHERE ph.payment_status = 'success'
  GROUP BY ph.payment_method
  ORDER BY count(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_method_stats() TO authenticated;
