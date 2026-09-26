-- Migration: 045_featured_player_slots
--
-- ScoutAfrica: Admin-controlled Featured Player Profiles (4 cards) and
-- Hero Spotlight Player, both currently hardcoded demo data in
-- app/lib/featuredPlayers.ts.
--
-- WHY A NEW TABLE: inspected first. No table resembling
-- featured/spotlight/showcase exists anywhere in the live schema
-- (confirmed via a live schema listing). app/lib/featuredPlayers.ts's own
-- header comment already anticipated this exact shape
-- ("featured_player_slots ... slot_type: 'hero_spotlight' |
-- 'featured_1'..'featured_4', player_id, active") - this migration
-- implements that plan, simplified slightly (slot_key doubles as both
-- the type AND the display order for the 4 featured cards, so a
-- separate display_order column would be redundant).
--
-- FIXED 5-ROW MODEL: exactly 5 permanent rows, seeded below
-- (hero_spotlight, featured_1..featured_4). The admin app only ever
-- UPDATEs a row's player_id/active - it never INSERTs or DELETEs a slot
-- row, so no admin INSERT/DELETE policy is needed at all, keeping the
-- RLS surface minimal. "Removing" a featured player means setting
-- player_id back to NULL and/or active=false on that row, which does
-- NOT touch the player's own account/profile row.
--
-- ON DELETE SET NULL (not CASCADE): if a player deletes their own
-- account (public.player has a real self-service DELETE policy -
-- confirmed via live RLS inspection), the slot row must survive as an
-- empty slot, not disappear - CASCADE would delete the slot row itself,
-- breaking the fixed-5-row assumption every reader relies on. SET NULL
-- empties the slot instead, which the read layer then treats as "fall
-- back to this slot's own demo player" - the same handling used for an
-- inactive slot.
--
-- Mirrors this project's established table/RLS conventions exactly
-- (043_platform_announcements: admin app_metadata.is_admin check,
-- separate admin-all-rows vs public-active-rows SELECT policies).
--
-- RLS TRUST MODEL: admin check is
-- ((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true
-- - the same real, server-only-writable admin boundary used by every
-- other admin-gated table in this schema (announcements, advertisements,
-- founder_profile, account_verifications, player's own admin UPDATE
-- policy). Never user_metadata, which is client-editable.
--
-- PUBLIC READ: app/page.tsx (the homepage) reads via the anon/public
-- Supabase client (app/lib/supabase.ts), not a service-role client, so a
-- public SELECT policy on active rows is required for the homepage to
-- read this table at all - confirmed by checking how app/page.tsx
-- already queries other tables (player, videos, account_verifications)
-- the same way.

CREATE TABLE IF NOT EXISTS public.featured_player_slots (
  id bigint generated always as identity primary key,
  slot_key text NOT NULL UNIQUE
    CHECK (slot_key IN ('hero_spotlight', 'featured_1', 'featured_2', 'featured_3', 'featured_4')),
  player_id bigint REFERENCES public.player(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.featured_player_slots ENABLE ROW LEVEL SECURITY;

-- --- Admin: full visibility and control over all 5 slots ---

DROP POLICY IF EXISTS "Admins can view all featured player slots" ON public.featured_player_slots;
CREATE POLICY "Admins can view all featured player slots"
  ON public.featured_player_slots FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

DROP POLICY IF EXISTS "Admins can update featured player slots" ON public.featured_player_slots;
CREATE POLICY "Admins can update featured player slots"
  ON public.featured_player_slots FOR UPDATE
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true)
  WITH CHECK (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

-- No INSERT/DELETE policy - see the fixed-5-row note above. Slots are
-- seeded once, below, and only ever updated afterward, by anyone,
-- admin included.

-- --- Non-admin: active slots only (the homepage's public read) ---

DROP POLICY IF EXISTS "Featured player slots are publicly viewable when active" ON public.featured_player_slots;
CREATE POLICY "Featured player slots are publicly viewable when active"
  ON public.featured_player_slots FOR SELECT
  USING (active = true);

-- Seed the 5 fixed, permanent slots. player_id starts NULL on every
-- slot - the read layer (app/lib/featuredPlayers.ts) falls back to that
-- slot's own demo player whenever player_id is NULL, active is false,
-- or the joined player row is missing, so the homepage's current
-- appearance is unaffected until an admin actively fills a slot in.
INSERT INTO public.featured_player_slots (slot_key, active)
VALUES
  ('hero_spotlight', true),
  ('featured_1', true),
  ('featured_2', true),
  ('featured_3', true),
  ('featured_4', true)
ON CONFLICT (slot_key) DO NOTHING;
