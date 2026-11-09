-- Migration: 052_restrict_player_private_columns
--
-- NOT YET APPLIED anywhere. Order (do not combine or reorder):
--   051 -> deploy the fix/contact-privacy application code -> 052 (this file).
-- Applying this before the new code is live breaks the current Production
-- pages that still query player with select(*) (permission denied for
-- column email).
--
-- Purpose (Production audit finding C1): anon and authenticated can read
-- player.email and player.date_of_birth through the public API. After this
-- migration they can SELECT only the 30 public columns. The owner and
-- admins read the two private columns through get_player_private() (051).
--
-- What changes:
--   - REVOKE table-level SELECT on public.player from anon, authenticated
--     (this also clears any earlier column-level SELECT grants for them).
--   - GRANT SELECT on exactly the 30 public columns. The list must stay
--     identical to PLAYER_PUBLIC_COLUMNS in app/lib/playerColumns.ts
--     (tests/privacy.test.mjs checks the app side).
--
-- What does NOT change:
--   - RLS and every policy (all policies that read player use only
--     player.id and player.user_id, both still granted - verified against
--     the Production catalog: no function, view or policy reads email or
--     date_of_birth as the caller).
--   - INSERT / UPDATE / DELETE privileges: registration still stores the
--     email and Edit Profile still saves the date of birth (writes need no
--     SELECT on those columns, and the app never reads a written row back).
--   - service_role and SECURITY DEFINER functions/triggers (bypass grants).
--
-- Safety: a guard first checks that public.player has exactly the 32
-- expected columns, so a column added later is never silently exposed or
-- hidden by a stale list. Re-runnable (same end state every time).
--
-- Rollback (re-exposes email and date_of_birth - only for emergencies):
--   GRANT SELECT ON public.player TO anon, authenticated,

DO $guard$
DECLARE
  expected text[] := ARRAY[
    'id', 'created_at', 'full_name', 'age', 'nationality', 'position', 'current_club', 'slug',
    'photo_url', 'email', 'scoutafrica_id', 'user_id', 'height', 'weight', 'preferred_foot',
    'date_of_birth', 'contract_expiry', 'bio', 'verified', 'cover_photo_url', 'matches', 'goals',
    'assists', 'minutes_played', 'clean_sheets', 'yellow_cards', 'red_card', 'playing_style',
    'strengths', 'secondary_position', 'languages_spoken', 'availability_status'];
  actual text[];
BEGIN
  SELECT array_agg(column_name::text ORDER BY column_name) INTO actual
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'player';

  IF actual IS DISTINCT FROM (SELECT array_agg(c ORDER BY c) FROM unnest(expected) c) THEN
    RAISE EXCEPTION 'public.player columns differ from the expected 32 - review 052 before applying (found: %)', actual;
  END IF;
END
$guard$;

REVOKE SELECT ON public.player FROM anon, authenticated;

GRANT SELECT (id, created_at, full_name, age, nationality, position, current_club, slug, photo_url,
  scoutafrica_id, user_id, height, weight, preferred_foot, contract_expiry, bio, verified,
  cover_photo_url, matches, goals, assists, minutes_played, clean_sheets, yellow_cards, red_card,
  playing_style, strengths, secondary_position, languages_spoken, availability_status)
  ON public.player TO anon, authenticated;
