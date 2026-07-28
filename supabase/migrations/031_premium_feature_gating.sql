-- Migration: 031_premium_feature_gating
-- ScoutAfrica: Phase 5 - server-side Premium enforcement
--
-- Messaging and Express Interest have no API route - both are direct
-- client-to-Supabase writes, with RLS as their only server-side boundary.
-- RESTRICTIVE policies here achieve genuine, unbypassable server-side
-- enforcement without restructuring either feature's existing data flow -
-- the client-side insert() calls themselves are completely unchanged.
--
-- RESTRICTIVE (not PERMISSIVE) is required: Postgres ORs together
-- multiple PERMISSIVE policies for the same command, so an additional
-- permissive policy would just be another way IN, not a requirement. A
-- RESTRICTIVE policy ANDs with every permissive policy - it narrows
-- access, which is exactly what "must also be premium" means here.
--
-- Every scenario below was tested directly against live data before
-- this file was written: non-premium message send (blocked), premium
-- message send (succeeds), non-premium contact request (blocked),
-- premium contact request (succeeds), free player under the video cap
-- (succeeds x3), free player over the cap (blocked on the 4th).

CREATE POLICY "Sender must be premium to send messages"
  ON public.messages
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (public.is_user_premium((select auth.uid())));

CREATE POLICY "Sender must be premium to submit a contact request"
  ON public.contact_requests
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (public.is_user_premium((select auth.uid())));

-- Unlimited highlight videos: free players keep a real cap (3) rather
-- than being blocked outright - "Unlimited" implies free users have SOME
-- limit today, not zero access.
CREATE POLICY "Free players are limited to 3 highlight videos"
  ON public.videos
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    public.is_user_premium((select auth.uid()))
    OR (SELECT count(*) FROM public.videos v WHERE v.player_id = (select auth.uid())) < 3
  );

-- Advanced Scout Search Filters is a read-only UI feature (which filters
-- are shown/enabled) with no corresponding write to gate - find-players
-- already reads public data any signed-in user can already see, so
-- filtering doesn't expose anything new. This is correctly a frontend
-- PremiumGuard concern, not an RLS/write-protection concern - no policy
-- change applies here, and none was added.
