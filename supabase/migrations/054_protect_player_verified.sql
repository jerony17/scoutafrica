-- Migration: 054_protect_player_verified
--
-- NOT YET APPLIED anywhere. Independent of 051/052/053.
--
-- Purpose (Production audit finding H1): the owner UPDATE policy on
-- public.player allows every column, including verified, so a player can
-- mark their own profile as verified (and a new player row can be inserted
-- already verified). Column privileges cannot fix this alone: admins use the
-- same authenticated role, so revoking UPDATE (verified) would block them.
--
-- What changes: a BEFORE INSERT OR UPDATE OF verified trigger on
-- public.player that, for API callers (current_user anon or authenticated)
-- who are NOT admins (JWT app_metadata.is_admin, settable only by the
-- server), rejects:
--   - an INSERT with verified = true,
--   - an UPDATE that changes verified (true -> false included).
-- The error is insufficient_privilege (42501).
--
-- What does NOT change:
--   - Admins: app/admin/verifications/VerificationsClient.tsx
--     update({ verified }) keeps working (admin JWT).
--   - Server and maintenance paths: service_role and postgres are not
--     anon/authenticated, so webhooks, SQL Editor and migrations are not
--     affected.
--   - Players: Edit Profile and registration never send verified, an
--     UPDATE OF verified trigger does not even fire for them. A save that
--     repeats the same value is also allowed (no change).
--   - The notify_player_verified trigger and all RLS policies.
--
-- Rollback: see 054_rollback.sql (drops the trigger and function).

CREATE OR REPLACE FUNCTION public.protect_player_verified()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  -- Only API callers are restricted, server roles pass.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF coalesce(((SELECT auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND coalesce(NEW.verified, false) THEN
    RAISE EXCEPTION 'Only an administrator can verify a player profile'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.verified IS DISTINCT FROM OLD.verified THEN
    RAISE EXCEPTION 'Only an administrator can change player verification'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_player_verified() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_player_verified() FROM anon, authenticated;

DROP TRIGGER IF EXISTS protect_player_verified ON public.player;
CREATE TRIGGER protect_player_verified
  BEFORE INSERT OR UPDATE OF verified ON public.player
  FOR EACH ROW EXECUTE FUNCTION public.protect_player_verified();
