-- Migration: 019_notifications_system
-- ScoutAfrica: Notifications & Approval Workflow (Sprint 2)
--
-- Single notifications table plus SECURITY DEFINER trigger functions on
-- EXISTING tables (contact_requests, player_reports, account_verifications,
-- player). No existing application table's columns are modified, and no
-- existing RLS policy is touched - this migration only adds new objects.
--
-- Idempotent: safe to run multiple times against the same database.

-- =============================================================
-- 1. notifications table
-- =============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid NOT NULL references auth.users(id) on delete cascade,
  title text NOT NULL,
  message text NOT NULL,
  type text,
  related_id bigint,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- 2. Index
-- =============================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created_at
  ON public.notifications (user_id, created_at DESC);

-- =============================================================
-- 3. RLS policies
--    Users may only SELECT/UPDATE (mark read) their own notifications.
--    There is intentionally NO insert policy for regular users - every
--    notification is created by a SECURITY DEFINER trigger function
--    below, never fabricated directly by a client. This has been tested
--    directly: an authenticated user attempting a manual insert receives
--    a row-level security violation.
-- =============================================================

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can mark their own notifications as read" ON public.notifications;
CREATE POLICY "Users can mark their own notifications as read"
  ON public.notifications FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================================
-- 4. Trigger functions (helper + one per event)
--    Each is CREATE OR REPLACE, which is inherently idempotent.
-- =============================================================

-- --- contact_requests: new request -> notify target player + all admins ---
CREATE OR REPLACE FUNCTION public.notify_new_contact_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_user_id uuid;
  v_admin_id uuid;
BEGIN
  SELECT user_id INTO v_player_user_id FROM public.player WHERE id = NEW.player_id;

  IF v_player_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      v_player_user_id,
      'New Contact Request',
      COALESCE(NEW.sender_type, 'A scout') || ' has sent a ' || COALESCE(NEW.request_type, 'contact') || ' request.',
      'contact_request_new',
      NEW.id
    );
  END IF;

  FOR v_admin_id IN
    SELECT id FROM auth.users WHERE (raw_app_meta_data ->> 'is_admin')::boolean = true
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      v_admin_id,
      'New Contact Request',
      'A new contact request was submitted and may need review.',
      'admin_new_contact_request',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- --- contact_requests: status change -> notify the sender (scout/club) ---
CREATE OR REPLACE FUNCTION public.notify_contact_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('accepted', 'rejected') AND NEW.sender_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      NEW.sender_id,
      CASE WHEN NEW.status = 'accepted' THEN 'Contact Request Approved' ELSE 'Contact Request Declined' END,
      CASE WHEN NEW.status = 'accepted'
        THEN 'Your contact request has been approved.'
        ELSE 'Your contact request was declined.'
      END,
      'contact_request_' || NEW.status,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- --- player: verified changes to true -> notify the player ---
CREATE OR REPLACE FUNCTION public.notify_player_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified IS DISTINCT FROM OLD.verified AND NEW.verified = true AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      NEW.user_id,
      'Profile Verified',
      'Congratulations! Your ScoutAfrica player profile has been verified.',
      'player_verified',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- --- account_verifications: new request -> notify all admins ---
CREATE OR REPLACE FUNCTION public.notify_new_account_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  FOR v_admin_id IN
    SELECT id FROM auth.users WHERE (raw_app_meta_data ->> 'is_admin')::boolean = true
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      v_admin_id,
      'New Verification Request',
      COALESCE(NEW.display_name, NEW.email, 'A user') || ' has requested ' || NEW.account_type || ' verification.',
      'admin_new_verification',
      NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- --- account_verifications: status change -> notify the scout/club ---
CREATE OR REPLACE FUNCTION public.notify_account_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('verified', 'rejected') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      NEW.user_id,
      CASE WHEN NEW.status = 'verified' THEN 'Account Verified' ELSE 'Verification Update' END,
      CASE WHEN NEW.status = 'verified'
        THEN 'Your ' || NEW.account_type || ' account has been verified.'
        ELSE 'Your ' || NEW.account_type || ' verification request was not approved.'
      END,
      'account_verification_' || NEW.status,
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- --- player_reports: new report -> notify all admins + (optional) the reported player ---
CREATE OR REPLACE FUNCTION public.notify_new_player_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_reported_user_id uuid;
BEGIN
  FOR v_admin_id IN
    SELECT id FROM auth.users WHERE (raw_app_meta_data ->> 'is_admin')::boolean = true
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      v_admin_id,
      'New Player Report',
      'A player profile was reported: ' || NEW.reason,
      'admin_new_report',
      NEW.id
    );
  END LOOP;

  SELECT user_id INTO v_reported_user_id FROM public.player WHERE id = NEW.player_id;
  IF v_reported_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      v_reported_user_id,
      'Profile Reported',
      'Your profile was reported and is being reviewed by the ScoutAfrica team.',
      'player_reported',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- =============================================================
-- 5. Triggers
--    Each is dropped first, so re-running this file is safe.
-- =============================================================

DROP TRIGGER IF EXISTS trg_notify_new_contact_request ON public.contact_requests;
CREATE TRIGGER trg_notify_new_contact_request
AFTER INSERT ON public.contact_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_new_contact_request();

DROP TRIGGER IF EXISTS trg_notify_contact_request_status ON public.contact_requests;
CREATE TRIGGER trg_notify_contact_request_status
AFTER UPDATE OF status ON public.contact_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_contact_request_status_change();

DROP TRIGGER IF EXISTS trg_notify_player_verified ON public.player;
CREATE TRIGGER trg_notify_player_verified
AFTER UPDATE OF verified ON public.player
FOR EACH ROW EXECUTE FUNCTION public.notify_player_verified();

DROP TRIGGER IF EXISTS trg_notify_new_account_verification ON public.account_verifications;
CREATE TRIGGER trg_notify_new_account_verification
AFTER INSERT ON public.account_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_new_account_verification();

DROP TRIGGER IF EXISTS trg_notify_account_verification_status ON public.account_verifications;
CREATE TRIGGER trg_notify_account_verification_status
AFTER UPDATE OF status ON public.account_verifications
FOR EACH ROW EXECUTE FUNCTION public.notify_account_verification_status();

DROP TRIGGER IF EXISTS trg_notify_new_player_report ON public.player_reports;
CREATE TRIGGER trg_notify_new_player_report
AFTER INSERT ON public.player_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_new_player_report();
