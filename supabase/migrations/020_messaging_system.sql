-- Migration: 020_messaging_system
-- ScoutAfrica: Messaging System
--
-- Extends the EXISTING conversations/messages tables rather than creating a
-- new, differently-shaped schema. scout_id/player_id already serve as
-- participant_one/participant_two (scout_id can hold any non-player
-- participant's uid - scout, club, or agent - nothing in the schema
-- restricts it to literally scouts); request_id already is
-- contact_request_id. No existing table was dropped or renamed.
--
-- Idempotent: safe to run multiple times against the same database.

-- =============================================================
-- 1. New columns on existing tables
-- =============================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read boolean NOT NULL DEFAULT false;

-- =============================================================
-- 2. "One conversation per approved Contact Request. No duplicate
--    conversations." - enforced at the database level.
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversations_request_id_unique'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_request_id_unique UNIQUE (request_id);
  END IF;
END $$;

-- =============================================================
-- 3. RLS: admin oversight + recipients marking messages as read
--    (existing participant-scoped SELECT/INSERT policies from Sprint 1A
--    are untouched - these are additive.)
-- =============================================================

DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
CREATE POLICY "Admins can view all conversations"
  ON public.conversations FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages"
  ON public.messages FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

DROP POLICY IF EXISTS "Recipients can mark their messages as read" ON public.messages;
CREATE POLICY "Recipients can mark their messages as read"
  ON public.messages FOR UPDATE
  USING ((select auth.uid()) = receiver_id)
  WITH CHECK ((select auth.uid()) = receiver_id);

-- =============================================================
-- 4. Auto-create conversation + notify both users when a contact request
--    is approved. This is the ONLY place a conversation row is created -
--    all client-side conversation-insert code was removed from
--    player-dashboard/requests and NotificationBell in this same change,
--    so conversation creation is identical regardless of whether the
--    approval comes from Admin or the player's own accept action, with no
--    duplicate-insert risk against the unique constraint above.
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_conversation_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_user_id uuid;
  v_conversation_id bigint;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'accepted' THEN
    INSERT INTO public.conversations (request_id, scout_id, player_id, active, last_message_at)
    VALUES (NEW.id, NEW.sender_id, NEW.player_id, true, now())
    ON CONFLICT (request_id) DO NOTHING
    RETURNING id INTO v_conversation_id;

    IF v_conversation_id IS NOT NULL THEN
      -- Notify the scout/club/agent (sender)
      INSERT INTO public.notifications (user_id, title, message, type, related_id)
      VALUES (
        NEW.sender_id,
        'Conversation Activated',
        'ScoutAfrica has approved your request. You can now message this player.',
        'conversation_activated',
        v_conversation_id
      );

      -- Notify the player
      SELECT user_id INTO v_player_user_id FROM public.player WHERE id = NEW.player_id;
      IF v_player_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, related_id)
        VALUES (
          v_player_user_id,
          'Conversation Activated',
          'A new conversation has been unlocked - you can now reply.',
          'conversation_activated',
          v_conversation_id
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_conversation_on_approval ON public.contact_requests;
CREATE TRIGGER trg_create_conversation_on_approval
AFTER UPDATE OF status ON public.contact_requests
FOR EACH ROW EXECUTE FUNCTION public.create_conversation_on_approval();

-- =============================================================
-- 5. New message -> bump conversation timestamp + notify the recipient.
--    Reuses the existing notifications table/system from Sprint 2 - no
--    second notification mechanism introduced.
-- =============================================================

CREATE OR REPLACE FUNCTION public.on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  IF NEW.receiver_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, related_id)
    VALUES (
      NEW.receiver_id,
      'New Message',
      'You have a new message on ScoutAfrica.',
      'new_message',
      NEW.conversation_id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_new_message ON public.messages;
CREATE TRIGGER trg_on_new_message
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.on_new_message();
