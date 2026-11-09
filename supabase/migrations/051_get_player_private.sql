-- Migration: 051_get_player_private
--
-- NOT YET APPLIED anywhere. Order (do not combine or reorder):
--   051 (this file) -> deploy the fix/contact-privacy application code -> 052.
--
-- Purpose: give a player (and admins) a way to read the two private
-- player columns, email and date_of_birth, that does NOT depend on the
-- public player table grants. Migration 052 then removes those two columns
-- from what anon/authenticated can SELECT on public.player, without this
-- function the owner would also lose access to their own date of birth on
-- Edit Profile (app/edit-profile/page.tsx calls
-- rpc(get_player_private, { p_player_id }) and reads the first row via
-- app/lib/playerPrivate.ts readPlayerPrivate()).
--
-- Contract:
--   get_player_private(p_player_id bigint)
--     RETURNS TABLE (email text, date_of_birth date)
--   - exactly one row when the caller owns that player row
--     (player.user_id = auth.uid()) or is an admin
--     (JWT app_metadata.is_admin = true, which only the server can set),
--   - no rows for anyone else and for an unknown id (no error, no hint
--     whether the player exists),
--   - signed-in users only: EXECUTE is revoked from PUBLIC and anon
--     (Supabase grants EXECUTE on new public functions to anon by default).
--
-- Safety:
--   - SECURITY DEFINER is required (052 removes the callers SELECT on
--     these columns). Hardened with an empty search_path and fully
--     qualified names, so it cannot be redirected to other objects.
--   - Read-only (STABLE, a single SELECT). Changes no data and no grants
--     on any table. Harmless to apply before the new app code: the current
--     Production code never calls it.
--   - CREATE OR REPLACE: re-runnable.
--
-- Rollback (test_env rollback file 051_rollback.sql):
--   DROP FUNCTION IF EXISTS public.get_player_private(bigint),
--   Safe while 052 is NOT applied. If 052 is applied, roll back 052 first
--   or owners cannot load their date of birth (Edit Profile then disables
--   that field instead of overwriting it - readPlayerPrivate returns null).

CREATE OR REPLACE FUNCTION public.get_player_private(p_player_id bigint)
RETURNS TABLE (email text, date_of_birth date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.email, p.date_of_birth
  FROM public.player p
  WHERE p.id = p_player_id
    AND (
      p.user_id = (SELECT auth.uid())
      OR coalesce(((SELECT auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean, false)
    );
$function$;

REVOKE ALL ON FUNCTION public.get_player_private(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_player_private(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_player_private(bigint) TO authenticated;

COMMENT ON FUNCTION public.get_player_private(bigint) IS
  'Private player fields (email, date_of_birth) for the owning user or an admin only; no rows otherwise. See migration 051.';
