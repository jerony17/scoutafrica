-- Migration: 055_contact_request_status_only
--
-- NOT YET APPLIED anywhere. Independent of 051-054.
--
-- Purpose (Production audit finding H2): the target player may UPDATE every
-- column of a contact request addressed to them, including sender_id and
-- message, and may set any status. Re-pointing sender_id and accepting
-- makes the create_conversation_on_approval trigger open a conversation
-- with any user and notify them that ScoutAfrica approved the request.
--
-- What changes:
--   1. CHECK constraint: status must be pending, accepted or rejected
--      (NULL still allowed - the app shows it as pending). Production
--      read-only check on 2026-11-07: all 8 rows are accepted.
--   2. Column privileges: table-level UPDATE is revoked from
--      anon/authenticated and only UPDATE (status) is granted to
--      authenticated. sender_id, player_id, message, sender_type,
--      request_type, reviewed_by and reviewed_at can no longer be changed
--      through the API by anyone (the app never changes them).
--   3. The target player policy Target player can update their own
--      request status now only applies to a request that is still pending
--      (NULL counts as pending, as the app shows it), and the new status
--      must be accepted or rejected. Once answered, the decision is final
--      for the player: an accepted or rejected request matches no player
--      policy, so a further change updates 0 rows.
--   4. The sender INSERT policy Users can insert contact requests
--      additionally requires a new request to start as pending, so a
--      sender cannot create a request that already looks accepted. The app
--      never sends a status (the column default pending applies).
--      (Approved to keep on 2026-11-07.)
--
-- What does NOT change:
--   - Admins keep their existing status authority (policy Admins can
--     update all contact requests is unchanged: any of the three values,
--     including changing an earlier decision). Like everyone else they can
--     update only the status column
--     (app/admin/contact-requests/page.tsx only sends status).
--   - The sender still cannot update their own request (no policy).
--   - RESTRICTIVE premium rule for creating requests, SELECT policies,
--     and the triggers (conversation creation, notifications) - they run
--     as SECURITY DEFINER and are not affected by the column grants.
--
-- App compatibility: player-dashboard/requests, NotificationBell and
-- admin/contact-requests all call update({ status }) with accepted or
-- rejected. express-interest inserts sender_id = self, player_id,
-- sender_type, request_type, message (no status).
--
-- Rollback: see 055_rollback.sql.

DO $guard$
DECLARE
  bad bigint;
BEGIN
  SELECT count(*) INTO bad FROM public.contact_requests
  WHERE status IS NOT NULL AND status NOT IN ('pending', 'accepted', 'rejected');
  IF bad > 0 THEN
    RAISE EXCEPTION 'Aborting: % contact request(s) have a status outside pending/accepted/rejected', bad;
  END IF;
END
$guard$;

-- 1. Allowed status values
ALTER TABLE public.contact_requests
  ADD CONSTRAINT contact_requests_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected'));

-- 2. Only status is updatable through the API
REVOKE UPDATE ON public.contact_requests FROM anon, authenticated;
GRANT UPDATE (status) ON public.contact_requests TO authenticated;

-- 3. Target player: answer a pending request once, accept or reject only
DROP POLICY IF EXISTS "Target player can update their own request status" ON public.contact_requests;
CREATE POLICY "Target player can update their own request status"
  ON public.contact_requests FOR UPDATE
  USING (
    coalesce(status, 'pending') = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = contact_requests.player_id AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    status IN ('accepted', 'rejected')
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = contact_requests.player_id AND p.user_id = (SELECT auth.uid())
    )
  );

-- 4. New requests start as pending
DROP POLICY IF EXISTS "Users can insert contact requests" ON public.contact_requests;
CREATE POLICY "Users can insert contact requests"
  ON public.contact_requests FOR INSERT
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND coalesce(status, 'pending') = 'pending'
  );
