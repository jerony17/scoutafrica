-- Migration: 049_paypal_provider
--
-- APPLIED to production (dbleskorympnnhekbkgo) on 2026-11-01 via the
-- tracked apply_migration mechanism (migration history version
-- 20261101142312), after a read-only inspection of the live schema and a
-- targeted backup of subscriptions and payment_history.
--
-- What it does (additive only - no existing row is updated or deleted):
--   1. Allows 'paypal' in subscriptions.payment_provider and
--      payment_history.payment_provider (keeps 'stripe' and 'paystack').
--   2. Adds subscriptions.paypal_subscription_id (PayPal "I-..." id) and
--      subscriptions.paypal_plan_id (both text, nullable, no default).
--   3. Adds a partial unique index so any non-NULL PayPal subscription id
--      maps to exactly one subscriptions row.
--
-- Safety design (review fixes):
--   - ONE statement. Everything is inside a single DO block, so it applies
--     completely or not at all whether run in the SQL editor or by
--     migration tooling - no BEGIN/COMMIT needed (none of this repo's
--     migrations use explicit transactions, and tooling may already wrap
--     one).
--   - EXACT provider check. The live CHECK's allowed values are extracted
--     and compared as a set. It must be exactly {paystack, stripe} (then
--     it is replaced) or exactly {paypal, paystack, stripe} (already done -
--     left alone). Anything else - an extra value, a missing value, a
--     different expression - aborts, so no allowed value can be silently
--     dropped.
--   - Column/index guards. If paypal_subscription_id / paypal_plan_id
--     already exist they must be text, and an existing index with the
--     planned name must have exactly the planned definition; otherwise it
--     aborts instead of silently skipping.
--   - Re-runnable: running it again after success changes nothing.
--
-- Not changed: RLS policies (writes stay service-role only), the status
-- CHECK, is_user_premium(), Stripe/Paystack columns, rows, and indexes.

DO $migration$
DECLARE
  t text;
  colname text;
  n_checks int;
  con_name text;
  con_def text;
  allowed text[];
  idx_def text;
BEGIN
  -- 1. payment_provider CHECK on both tables: exact-set comparison.
  FOREACH t IN ARRAY ARRAY['subscriptions', 'payment_history'] LOOP
    SELECT count(*) INTO n_checks
    FROM pg_constraint c
    WHERE c.conrelid = format('public.%I', t)::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%payment_provider%';

    IF n_checks <> 1 THEN
      RAISE EXCEPTION 'public.%: expected exactly 1 CHECK mentioning payment_provider, found % - aborting', t, n_checks;
    END IF;

    SELECT c.conname, pg_get_constraintdef(c.oid) INTO con_name, con_def
    FROM pg_constraint c
    WHERE c.conrelid = format('public.%I', t)::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%payment_provider%';

    -- Expected shape: a single "payment_provider = ANY (ARRAY[...])" list,
    -- which is how Postgres stores "payment_provider IN (...)" on a text
    -- column. Anything more complex aborts rather than being rewritten.
    IF con_def !~* '^CHECK \(\(payment_provider = ANY \(ARRAY\[[^]]*\]\)\)\)$' THEN
      RAISE EXCEPTION 'public.%: payment_provider CHECK % has an unexpected form: % - aborting', t, con_name, con_def;
    END IF;

    SELECT array_agg(m[1] ORDER BY m[1]) INTO allowed
    FROM regexp_matches(con_def, '''([^'']*)''', 'g') AS m;

    IF allowed = ARRAY['paypal', 'paystack', 'stripe'] THEN
      RAISE NOTICE 'public.%: % already allows paypal - unchanged', t, con_name;
    ELSIF allowed = ARRAY['paystack', 'stripe'] THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, con_name);
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (payment_provider IN (''stripe'', ''paystack'', ''paypal''))',
        t, con_name
      );
      RAISE NOTICE 'public.%: % now allows stripe, paystack, paypal', t, con_name;
    ELSE
      RAISE EXCEPTION 'public.%: payment_provider CHECK % allows %, expected exactly {paystack, stripe} - aborting',
        t, con_name, allowed;
    END IF;
  END LOOP;

  -- 2. PayPal columns: create if absent; if already present they must be text.
  FOREACH colname IN ARRAY ARRAY['paypal_subscription_id', 'paypal_plan_id'] LOOP
    PERFORM 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = colname AND data_type <> 'text';
    IF FOUND THEN
      RAISE EXCEPTION 'public.subscriptions.% already exists with a non-text type - aborting', colname;
    END IF;

    EXECUTE format('ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS %I text', colname);
  END LOOP;

  -- 3. Partial unique index: create if absent; if present it must match exactly.
  SELECT indexdef INTO idx_def
  FROM pg_indexes
  WHERE schemaname = 'public' AND indexname = 'subscriptions_paypal_subscription_id_unique';

  IF idx_def IS NULL THEN
    CREATE UNIQUE INDEX subscriptions_paypal_subscription_id_unique
      ON public.subscriptions (paypal_subscription_id)
      WHERE paypal_subscription_id IS NOT NULL;
  ELSIF idx_def <> 'CREATE UNIQUE INDEX subscriptions_paypal_subscription_id_unique ON public.subscriptions USING btree (paypal_subscription_id) WHERE (paypal_subscription_id IS NOT NULL)' THEN
    RAISE EXCEPTION 'Index subscriptions_paypal_subscription_id_unique already exists with a different definition: % - aborting', idx_def;
  END IF;
END
$migration$;

-- Rollback (only while no row uses payment_provider = 'paypal'):
--   for each of subscriptions / payment_history:
--     ALTER TABLE public.<t> DROP CONSTRAINT <same name>;
--     ALTER TABLE public.<t> ADD CONSTRAINT <same name> CHECK (payment_provider IN ('stripe', 'paystack'));
--   DROP INDEX public.subscriptions_paypal_subscription_id_unique;
--   ALTER TABLE public.subscriptions DROP COLUMN paypal_subscription_id, DROP COLUMN paypal_plan_id;
