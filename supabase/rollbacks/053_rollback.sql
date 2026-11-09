-- ROLLBACK for 053_messaging_participant_checks.
-- Restores the previous INSERT policy and the table-level UPDATE/DELETE
-- grants, and removes the foreign key and index. One transaction.
-- No rows are changed.
BEGIN;
DROP POLICY IF EXISTS "Participants can send messages in their own conversation" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages as themselves" ON public.messages;
CREATE POLICY "Users can send messages as themselves" ON public.messages
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = sender_id);
REVOKE UPDATE (read) ON public.messages FROM authenticated;
GRANT UPDATE ON public.messages TO anon, authenticated;
GRANT UPDATE, DELETE ON public.conversations TO anon, authenticated;
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
DROP INDEX IF EXISTS public.idx_messages_conversation_id;
COMMIT;
