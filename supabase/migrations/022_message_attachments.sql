-- Migration: 022_message_attachments
-- ScoutAfrica: secure file sharing for messaging
--
-- New objects only - no existing table (messages, conversations) is
-- altered. "A message may contain text, a file, or both" is handled by
-- allowing an empty string in the existing NOT NULL messages.message
-- column at the application level, rather than relaxing that constraint.

-- Private bucket - unlike the existing public media buckets
-- (player-photos, cover-photos, profile-photos, highlight-videos),
-- attachments must be participant-only, so RLS on storage.objects is the
-- real access control, not bucket-level public visibility.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('message-files', 'message-files', false, 20971520) -- 20MB
ON CONFLICT (id) DO NOTHING;

-- Path convention: {conversation_id}/{filename} - lets the storage policy
-- check conversation participancy directly from the object path via
-- storage.foldername(name).
DROP POLICY IF EXISTS "Participants can upload attachments to their conversation" ON storage.objects;
CREATE POLICY "Participants can upload attachments to their conversation"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'message-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.player p ON p.id = c.player_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND ((select auth.uid()) = c.scout_id OR p.user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Participants can view attachments in their conversation" ON storage.objects;
CREATE POLICY "Participants can view attachments in their conversation"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-files'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      LEFT JOIN public.player p ON p.id = c.player_id
      WHERE c.id::text = (storage.foldername(name))[1]
        AND ((select auth.uid()) = c.scout_id OR p.user_id = (select auth.uid()))
    )
  );

-- Attachment metadata, linked to a message
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id bigint generated always as identity primary key,
  message_id bigint NOT NULL references public.messages(id) on delete cascade,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- Same participant check used by messages/conversations RLS elsewhere in
-- this project, joined through the parent message -> conversation.
DROP POLICY IF EXISTS "Participants can view attachments in their conversation" ON public.message_attachments;
CREATE POLICY "Participants can view attachments in their conversation"
  ON public.message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      LEFT JOIN public.player p ON p.id = c.player_id
      WHERE m.id = message_attachments.message_id
        AND ((select auth.uid()) = c.scout_id OR p.user_id = (select auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Participants can attach files to their own messages" ON public.message_attachments;
CREATE POLICY "Participants can attach files to their own messages"
  ON public.message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_attachments.message_id
        AND m.sender_id = (select auth.uid())
    )
  );
