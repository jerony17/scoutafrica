-- Migration: 023_player_views_tracking
-- ScoutAfrica: minimal, real tracking for "Total Players Viewed"
--
-- This stat is required by the Club Dashboard but has no existing data
-- source anywhere in the schema. Deliberately small: one table, no
-- analytics/aggregation infrastructure - just enough to make the number
-- real rather than hardcoded.

CREATE TABLE IF NOT EXISTS public.player_views (
  id bigint generated always as identity primary key,
  viewer_id uuid NOT NULL references auth.users(id) on delete cascade,
  player_id bigint NOT NULL references public.player(id) on delete cascade,
  viewed_at timestamptz DEFAULT now()
);
ALTER TABLE public.player_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can log their own player views" ON public.player_views;
CREATE POLICY "Users can log their own player views"
  ON public.player_views FOR INSERT
  WITH CHECK ((select auth.uid()) = viewer_id);

DROP POLICY IF EXISTS "Users can view their own view history" ON public.player_views;
CREATE POLICY "Users can view their own view history"
  ON public.player_views FOR SELECT
  USING ((select auth.uid()) = viewer_id);

CREATE INDEX IF NOT EXISTS idx_player_views_viewer_id ON public.player_views (viewer_id);
