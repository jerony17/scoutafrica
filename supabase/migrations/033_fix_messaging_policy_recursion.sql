-- Migration: 033_fix_messaging_policy_recursion
-- ScoutAfrica: fix infinite recursion in the messages RLS policy
--
-- Found via direct testing (not assumed) before this was considered done:
-- migration 032's policy subquery read from messages directly, which
-- re-triggered the same RLS policy being evaluated on that same table,
-- causing Postgres to recurse ("infinite recursion detected in policy").
-- This would have broken every message send, first or reply, once
-- deployed. A SECURITY DEFINER function breaks the cycle by reading with
-- elevated privileges internally - the same pattern already used by
-- is_user_premium() and every other cross-cutting check in this project.
--
-- Retested after this fix, all three scenarios directly against live
-- data: non-premium user blocked from initiating (no recursion error,
-- correct RLS violation instead), premium user succeeds initiating, and
-- critically - a genuinely non-premium player successfully replies once
-- the conversation already has one message.

CREATE OR REPLACE FUNCTION public.conversation_has_messages(p_conversation_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = p_conversation_id);
$$;

DROP POLICY IF EXISTS "First message in a conversation must come from a premium sender" ON public.messages;

CREATE POLICY "First message in a conversation must come from a premium sender"
  ON public.messages
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (
    public.is_user_premium((select auth.uid()))
    OR public.conversation_has_messages(conversation_id)
  );
