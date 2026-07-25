-- Migration: 027_remove_verification_expiry
-- ScoutAfrica: remove verification expiry, permanent verification model
--
-- Reverses the expiry system from migration 026. Verification is now
-- permanent once granted, until a ScoutAfrica admin explicitly revokes it
-- (implemented as an admin-only transition back to 'rejected' - reusing
-- the existing reject mechanism rather than inventing a new status, since
-- only 3 statuses now exist: pending, verified, rejected, plus the
-- implicit "not verified" of no row existing at all).

-- Drop the scheduled-sweep function entirely (renewal reminders + auto-expire)
DROP FUNCTION IF EXISTS public.process_verification_expiry();

-- Drop the policy that references expiry_date BEFORE dropping the column
DROP POLICY IF EXISTS "Organizations can resubmit a rejected or expired application" ON public.account_verifications;
DROP POLICY IF EXISTS "Organizations can resubmit a rejected application" ON public.account_verifications;
DROP POLICY IF EXISTS "Organizations can resubmit an expired application" ON public.account_verifications;

-- Replace the expiry-setting trigger with one that just records who/when
-- verified, no expiry_date
CREATE OR REPLACE FUNCTION public.set_verification_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'verified' AND OLD.status IS DISTINCT FROM 'verified' THEN
    NEW.verified_by := auth.uid();
    NEW.verified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Now safe to drop expiry columns
ALTER TABLE public.account_verifications DROP COLUMN IF EXISTS expiry_date;
ALTER TABLE public.account_verifications DROP COLUMN IF EXISTS expiry_notified_at;

-- Remove 'expired' from the allowed status values - back to 3 states
ALTER TABLE public.account_verifications DROP CONSTRAINT IF EXISTS account_verifications_status_check;
ALTER TABLE public.account_verifications
  ADD CONSTRAINT account_verifications_status_check
  CHECK (status IN ('pending', 'verified', 'rejected'));

-- Resubmission is only for rejected applications now. Tested directly: a
-- verified org's row cannot be touched by them at all (no self-service
-- path exists once verified) - the only way status ever leaves 'verified'
-- is an admin explicitly revoking it.
CREATE POLICY "Organizations can resubmit a rejected application"
  ON public.account_verifications FOR UPDATE
  USING ((select auth.uid()) = user_id AND status = 'rejected')
  WITH CHECK ((select auth.uid()) = user_id AND status = 'pending');

-- Resubmission notification only fires from 'rejected' now
CREATE OR REPLACE FUNCTION public.notify_verification_resubmitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'rejected' AND NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      NEW.user_id,
      'Application Resubmitted',
      'Your updated ' || NEW.account_type || ' verification application is pending review.',
      'verification_submitted',
      NEW.id
    );

    DECLARE
      v_admin_id uuid;
    BEGIN
      FOR v_admin_id IN
        SELECT id FROM auth.users WHERE (raw_app_meta_data ->> 'is_admin')::boolean = true
      LOOP
        INSERT INTO public.notifications (user_id, title, message, type, related_id)
        VALUES (
          v_admin_id,
          'Verification Application Resubmitted',
          NEW.organization_name || ' resubmitted their verification application.',
          'admin_new_verification',
          NEW.id
        );
      END LOOP;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- New: notify the organization when an admin explicitly revokes their
-- verification (verified -> rejected, admin-initiated only - tested
-- directly and confirmed this is the ONLY path that can produce this
-- transition, since the org's own RLS policy never permits touching a
-- 'verified' row at all).
CREATE OR REPLACE FUNCTION public.notify_verification_revoked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'verified' AND NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      NEW.user_id,
      'Verification Revoked',
      'Your ' || NEW.account_type || ' verification has been revoked by a ScoutAfrica administrator.' ||
        CASE WHEN NEW.rejection_reason IS NOT NULL THEN ' Reason: ' || NEW.rejection_reason ELSE '' END,
      'verification_revoked',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_verification_revoked ON public.account_verifications;
CREATE TRIGGER trg_notify_verification_revoked
AFTER UPDATE OF status ON public.account_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_verification_revoked();
