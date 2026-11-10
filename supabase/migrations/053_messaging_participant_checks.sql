-- Migration: 053_messaging_participant_checks
--
-- NOT YET APPLIED anywhere. Independent of 051/052 (any order after them).
--
-- Purpose (Production audit finding C2): today a message INSERT only checks
-- sender_id = auth.uid() (plus the premium-or-existing-thread rule). Nothing
-- ties conversation_id or receiver_id to the sender, conversation_id has no
-- foreign key, and a recipient may UPDATE every column of a received
-- message. So any premium user can message anyone, any user can inject a
-- message into another active conversation, and a recipient can rewrite
-- the text or sender of messages they received.
--
-- What changes:
--   1. Foreign key messages.conversation_id -> conversations.id
--      (NO ACTION on delete: a conversation with messages cannot be deleted
--      by accident - conversations are never deleted by the app).
--   2. Index on messages.conversation_id (the messages page loads a thread
--      by conversation_id, and the new foreign key needs it).
--   3. INSERT policy Users can send messages as themselves is replaced by
--      Participants can send messages in their own conversation: the
--      conversation must be ACTIVE (conversations.active = true), the
--      sender must be the caller AND one side of that conversation, and the
--      receiver must be the OTHER side:
--        scout side  = conversations.scout_id
--        player side = player.user_id of conversations.player_id
--   4. Recipients may UPDATE only the read column: table-level UPDATE is
--      revoked from anon/authenticated and UPDATE (read) is granted to
--      authenticated. The existing policy Recipients can mark their
--      messages as read (receiver only) is unchanged.
--   5. Conversation participants cannot be changed through the API:
--      UPDATE and DELETE on conversations are revoked from
--      anon/authenticated. RLS already has no UPDATE or DELETE policy for
--      conversations, so nothing the app does changes - this is defence in
--      depth so a future policy cannot accidentally reopen it. The
--      on_new_message trigger (last_message_at) and the approval trigger
--      run as SECURITY DEFINER and are not affected.
--
-- What does NOT change:
--   - RESTRICTIVE policy First message in a conversation must come from a
--     premium sender (premium rule kept exactly).
--   - SELECT policies (participants and admins), Realtime, attachments,
--     the on_new_message trigger, contact_requests, and the INSERT policy
--     Player can create a conversation from their accepted request.
--   - Existing rows: nothing is updated or deleted (historical
--     conversations, including one whose player was deleted, stay as they
--     are - no message can be sent in that one, as today).
--
-- App compatibility (app/messages/page.tsx): sendMessage() inserts
-- sender_id = current user, receiver_id = the other participant
-- (scout_id or the player user_id) and conversation_id = the open thread,
-- then reads back id, created_at (allowed: sender can view own messages).
-- Read receipts call update({ read: true }) only. Both stay allowed.
--
-- Safety: a guard aborts if any existing message would violate the new
-- foreign key or participant rule (Production read-only count on
-- 2026-11-07: 15 messages, 0 null or orphaned conversation_id, 0 not
-- between the two participants). Runs as one transaction.
--
-- Rollback: see 053_rollback.sql (restores the previous policy and grants,
-- and drops the foreign key and index).
--
-- Before applying to Production: count conversations with active = false
-- (read-only). Messages in those would be refused from then on.

DO $guard$
DECLARE
  bad_fk bigint;
  bad_pair bigint;
BEGIN
  SELECT count(*) INTO bad_fk FROM public.messages m
  WHERE m.conversation_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = m.conversation_id);

  -- NULL-safe: a missing player, player account, scout, sender or receiver
  -- makes the pair test NULL, which NOT would silently drop - count it.
  SELECT count(*) INTO bad_pair FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.player p ON p.id = c.player_id
  WHERE p.user_id IS NULL OR c.scout_id IS NULL
     OR m.sender_id IS NULL OR m.receiver_id IS NULL
     OR NOT ((m.sender_id = c.scout_id AND m.receiver_id = p.user_id)
          OR (m.sender_id = p.user_id AND m.receiver_id = c.scout_id));

  IF bad_fk > 0 THEN
    RAISE EXCEPTION 'Aborting: % message(s) reference a missing conversation', bad_fk;
  END IF;
  IF bad_pair > 0 THEN
    -- Not a blocker for the new rules (they only check new inserts), but
    -- it means existing data does not match the model - review first.
    RAISE EXCEPTION 'Aborting: % existing message(s) are not between the two conversation participants', bad_pair;
  END IF;
END
$guard$;

-- 1 + 2. Foreign key and its index
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages (conversation_id);

ALTER TABLE public.messages
  ADD CONSTRAINT messages_conversation_id_fkey
  FOREIGN KEY (conversation_id) REFERENCES public.conversations (id);

-- 3. Participant-checked INSERT
DROP POLICY IF EXISTS "Users can send messages as themselves" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages in their own conversation" ON public.messages;
CREATE POLICY "Participants can send messages in their own conversation"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      LEFT JOIN public.player p ON p.id = c.player_id
      WHERE c.id = messages.conversation_id
        AND c.active
        AND (
          (c.scout_id = (SELECT auth.uid()) AND p.user_id = messages.receiver_id)
          OR (p.user_id = (SELECT auth.uid()) AND c.scout_id = messages.receiver_id)
        )
    )
  );

-- 4. Recipients may change only the read flag
REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE (read) ON public.messages TO authenticated;

-- 5. Conversation participants cannot be changed or removed through the API
REVOKE UPDATE, DELETE ON public.conversations FROM anon, authenticated;
