-- Migration: 021_enable_realtime_messages
-- ScoutAfrica: fix real-time messaging not firing
--
-- Root cause: the messages table was never added to the supabase_realtime
-- publication. Realtime subscriptions in the client connect successfully
-- regardless of this (no error surfaces), but Postgres never sends
-- row-change events to the Realtime server for a table that isn't in the
-- publication - so postgres_changes listeners for that table receive
-- nothing, even though the underlying INSERT succeeds correctly.
--
-- This is a publication-membership change, not a schema change and not an
-- RLS change - neither was touched.
--
-- Idempotent: ADD TABLE fails if the table is already a member, so this
-- guards against re-running.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
