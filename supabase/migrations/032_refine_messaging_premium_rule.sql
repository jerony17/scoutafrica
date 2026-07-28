-- Migration: 032_refine_messaging_premium_rule
-- ScoutAfrica: refine the messaging Premium rule
--
-- Old rule (migration 031): every message sender must be premium. Too
-- strict - it blocked a free player from ever replying to a conversation
-- a premium scout had already opened with them.
--
-- New rule: the FIRST message in a conversation must come from a premium
-- sender (that's what "initiating" means) - every message AFTER that can
-- come from anyone who's a legitimate sender in that conversation,
-- regardless of their own premium status. contact_requests' premium gate
-- is unchanged - submitting a NEW request is the actual initiation
-- mechanism a conversation is created from, so "free users may not
-- initiate" was already correctly enforced there.
--
-- NOTE: superseded by migration 033 in the same session, which fixes an
-- infinite-recursion bug in the policy this file originally created.
-- Both are kept as the real historical record of what was applied.

DROP POLICY IF EXISTS "Sender must be premium to send messages" ON public.messages;

CREATE POLICY "First message in a conversation must come from a premium sender"
  ON public.messages
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    public.is_user_premium((select auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = messages.conversation_id
    )
  );
