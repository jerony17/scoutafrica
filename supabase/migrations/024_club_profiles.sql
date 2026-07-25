-- Migration: 024_club_profiles
-- ScoutAfrica: Club Profile Management
--
-- Two tables, not one: RLS is row-level in Postgres, so a single table
-- with public SELECT would make email/phone readable via any direct
-- client query regardless of what the frontend chooses to display.
-- Splitting means the private fields have their own row-level policy
-- that never grants public/anon access at all - a real security boundary,
-- not just a UI convention.

CREATE TABLE IF NOT EXISTS public.club_profiles (
  id bigint generated always as identity primary key,
  user_id uuid NOT NULL UNIQUE references auth.users(id) on delete cascade,
  club_name text,
  logo_url text,
  cover_photo_url text,
  description text,
  country text,
  city text,
  founded_year integer,
  stadium text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.club_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club profiles are publicly readable" ON public.club_profiles;
CREATE POLICY "Club profiles are publicly readable"
  ON public.club_profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Clubs can create their own profile" ON public.club_profiles;
CREATE POLICY "Clubs can create their own profile"
  ON public.club_profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Clubs can update only their own profile" ON public.club_profiles;
CREATE POLICY "Clubs can update only their own profile"
  ON public.club_profiles FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE TABLE IF NOT EXISTS public.club_private_info (
  id bigint generated always as identity primary key,
  user_id uuid NOT NULL UNIQUE references auth.users(id) on delete cascade,
  email text,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.club_private_info ENABLE ROW LEVEL SECURITY;

-- Deliberately NO public SELECT policy here at all - only the owner (and
-- admin, for account-management oversight, matching the pattern already
-- used for contact_requests/player_reports/player elsewhere).
DROP POLICY IF EXISTS "Clubs can view only their own private info" ON public.club_private_info;
CREATE POLICY "Clubs can view only their own private info"
  ON public.club_private_info FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all club private info" ON public.club_private_info;
CREATE POLICY "Admins can view all club private info"
  ON public.club_private_info FOR SELECT
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'is_admin')::boolean = true);

DROP POLICY IF EXISTS "Clubs can create their own private info" ON public.club_private_info;
CREATE POLICY "Clubs can create their own private info"
  ON public.club_private_info FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Clubs can update only their own private info" ON public.club_private_info;
CREATE POLICY "Clubs can update only their own private info"
  ON public.club_private_info FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Public stats (Total Players Viewed / Watchlist Count / Contact Requests
-- Sent) need to be visible on a PUBLIC profile page, but the underlying
-- rows in player_views/watchlist/contact_requests are owner-scoped by
-- design and must stay that way - showing public stats should not mean
-- exposing which specific players a club viewed. A SECURITY DEFINER
-- function that returns ONLY aggregate counts (never row-level data) is
-- the safe pattern for this.
CREATE OR REPLACE FUNCTION public.get_club_public_stats(p_user_id uuid)
RETURNS TABLE (players_viewed bigint, watchlist_count bigint, contact_requests_sent bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    (SELECT count(*) FROM public.player_views WHERE viewer_id = p_user_id),
    (SELECT count(*) FROM public.watchlist WHERE scout_id = p_user_id),
    (SELECT count(*) FROM public.contact_requests WHERE sender_id = p_user_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_club_public_stats(uuid) TO anon, authenticated;
