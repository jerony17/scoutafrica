-- Migration: 026_organization_verification_system
-- ScoutAfrica: Organization Verification System
--
-- Extends the EXISTING account_verifications table/workflow (built in an
-- earlier round) rather than creating a parallel second verification
-- system.
--
-- MVP NOTE: expiry is stored (verified_at, expiry_date) but NOT swept by
-- a scheduled job (pg_cron was evaluated and deliberately not used for
-- the MVP). Effective status ("has this actually expired?") is computed
-- on read instead - see getEffectiveVerificationStatus() in
-- app/lib/types.ts, used consistently across the verification page, the
-- admin panel, and every dashboard/profile badge. Automated renewal
-- reminders and a scheduled expiry sweep are left for a future
-- implementation after launch.

ALTER TABLE public.account_verifications DROP CONSTRAINT IF EXISTS account_verifications_account_type_check;
ALTER TABLE public.account_verifications
  ADD CONSTRAINT account_verifications_account_type_check
  CHECK (account_type IN ('club', 'scout', 'agent', 'academy'));

ALTER TABLE public.account_verifications DROP CONSTRAINT IF EXISTS account_verifications_status_check;
ALTER TABLE public.account_verifications
  ADD CONSTRAINT account_verifications_status_check
  CHECK (status IN ('pending', 'verified', 'rejected', 'expired'));

ALTER TABLE public.account_verifications
  ADD COLUMN IF NOT EXISTS organization_name text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS representative_name text,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS verified_by uuid references auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_date timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- === RLS ===
-- Existing SELECT policies (own row + admin) from the earlier round are
-- untouched. Org self-edit is allowed when the row is 'rejected' OR when
-- it is 'verified' but effectively expired (expiry_date has passed) -
-- since nothing automatically flips the stored status to 'expired' for
-- the MVP, the policy itself checks the date directly rather than relying
-- on that column being current. WITH CHECK only ever allows moving the
-- row to 'pending' - never directly to 'verified'. Tested directly: a
-- self-approval attempt raises a genuine RLS violation error; an
-- effectively-expired (but still stored as 'verified') row can be
-- resubmitted; a genuinely still-valid verified row cannot be touched.
DROP POLICY IF EXISTS "Organizations can resubmit a rejected application" ON public.account_verifications;
DROP POLICY IF EXISTS "Organizations can resubmit a rejected or expired application" ON public.account_verifications;
CREATE POLICY "Organizations can resubmit a rejected or expired application"
  ON public.account_verifications FOR UPDATE
  USING (
    (select auth.uid()) = user_id
    AND (status = 'rejected' OR (status = 'verified' AND expiry_date IS NOT NULL AND expiry_date <= now()))
  )
  WITH CHECK ((select auth.uid()) = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Users can create their own pending verification" ON public.account_verifications;
CREATE POLICY "Users can create their own pending verification"
  ON public.account_verifications FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id AND status = 'pending');

-- === Documents (private, admin + owner only, never public) ===
CREATE TABLE IF NOT EXISTS public.verification_documents (
  id bigint generated always as identity primary key,
  application_id bigint NOT NULL references public.account_verifications(id) on delete cascade,
  document_type text NOT NULL CHECK (document_type IN ('business_registration', 'fa_license', 'government_registration', 'supporting')),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  uploaded_at timestamptz DEFAULT now()
);
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizations can view their own documents" ON public.verification_documents;
CREATE POLICY "Organizations can view their own documents"
  ON public.verification_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_verifications av
      WHERE av.id = verification_documents.application_id AND av.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can view all verification documents" ON public.verification_documents;
CREATE POLICY "Admins can view all verification documents"
  ON public.verification_documents FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

DROP POLICY IF EXISTS "Organizations can upload documents to their own application" ON public.verification_documents;
CREATE POLICY "Organizations can upload documents to their own application"
  ON public.verification_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.account_verifications av
      WHERE av.id = verification_documents.application_id AND av.user_id = (select auth.uid())
    )
  );

-- === Storage: private bucket, admin previews via signed URLs ===
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-documents', 'verification-documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Organizations can upload their own verification documents" ON storage.objects;
CREATE POLICY "Organizations can upload their own verification documents"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'verification-documents' AND (storage.foldername(name))[1] = (select auth.uid())::text);

DROP POLICY IF EXISTS "Organizations can view their own verification documents" ON storage.objects;
CREATE POLICY "Organizations can view their own verification documents"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'verification-documents' AND (storage.foldername(name))[1] = (select auth.uid())::text);

DROP POLICY IF EXISTS "Admins can view all verification documents in storage" ON storage.objects;
CREATE POLICY "Admins can view all verification documents in storage"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'verification-documents' AND ((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- === Notifications (ADDITIVE only - notify_new_account_verification and
-- notify_account_verification_status from the earlier round are untouched) ===

CREATE OR REPLACE FUNCTION public.notify_verification_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, related_id)
  VALUES (
    NEW.user_id,
    'Application Submitted',
    'Your ' || NEW.account_type || ' verification application has been submitted and is pending review.',
    'verification_submitted',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_verification_submitted ON public.account_verifications;
CREATE TRIGGER trg_notify_verification_submitted
AFTER INSERT ON public.account_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_verification_submitted();

CREATE OR REPLACE FUNCTION public.notify_verification_resubmitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('rejected', 'verified') AND NEW.status = 'pending' THEN
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

DROP TRIGGER IF EXISTS trg_notify_verification_resubmitted ON public.account_verifications;
CREATE TRIGGER trg_notify_verification_resubmitted
AFTER UPDATE OF status ON public.account_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_verification_resubmitted();

-- === Expiry: fields + auto-set on approval only. No scheduled sweep for
-- the MVP (see note at top of file) - set_verification_expiry() below is
-- the only automated piece, firing synchronously when an admin approves.
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
    NEW.expiry_date := now() + interval '12 months';
    NEW.expiry_notified_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_verification_expiry ON public.account_verifications;
CREATE TRIGGER trg_set_verification_expiry
BEFORE UPDATE OF status ON public.account_verifications
FOR EACH ROW EXECUTE FUNCTION public.set_verification_expiry();

-- Kept as a plain callable function (not scheduled) for a future
-- implementation - a scheduler (pg_cron or an external cron calling this
-- via an Edge Function) can invoke it once that phase is built. Not
-- wired to anything automatically for the MVP.
CREATE OR REPLACE FUNCTION public.process_verification_expiry()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM public.account_verifications
    WHERE status = 'verified'
      AND expiry_date IS NOT NULL
      AND expiry_date <= now() + interval '30 days'
      AND expiry_date > now()
      AND expiry_notified_at IS NULL
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      r.user_id,
      'Verification Renewal Due Soon',
      'Your ' || r.account_type || ' verification expires on ' || to_char(r.expiry_date, 'YYYY-MM-DD') || '. Please renew to keep your verified badge.',
      'verification_renewal_due',
      r.id
    );

    UPDATE public.account_verifications SET expiry_notified_at = now() WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT * FROM public.account_verifications
    WHERE status = 'verified'
      AND expiry_date IS NOT NULL
      AND expiry_date <= now()
  LOOP
    UPDATE public.account_verifications SET status = 'expired', updated_at = now() WHERE id = r.id;

    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      r.user_id,
      'Verification Expired',
      'Your ' || r.account_type || ' verification has expired. Submit a new application to regain your verified badge.',
      'verification_expired',
      r.id
    );
  END LOOP;
END;
$$;
