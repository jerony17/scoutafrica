-- Migration: 036_academy_profiles
--
-- ScoutAfrica: Academy Profile Management
--
-- Mirrors club_profiles (024) exactly in architecture and RLS pattern.
-- Deliberately ONE table, not split into a public/private pair like
-- club_profiles/club_private_info.

CREATE TABLE IF NOT EXISTS public.academy_profiles (
  id bigint generated always as identity primary key,
  user_id uuid NOT NULL UNIQUE references auth.users(id) on delete cascade,
  academy_name text,
  logo_url text,
  cover_photo_url text,
  description text,
  country text,
  city text,
  website text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.academy_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Academy profiles are publicly readable"
  ON public.academy_profiles;

CREATE POLICY "Academy profiles are publicly readable"
  ON public.academy_profiles
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Academies can create their own profile"
  ON public.academy_profiles;

CREATE POLICY "Academies can create their own profile"
  ON public.academy_profiles
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Academies can update only their own profile"
  ON public.academy_profiles;

CREATE POLICY "Academies can update only their own profile"
  ON public.academy_profiles
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ============================================================
-- Storage: academy-logos / academy-covers
-- ============================================================

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'academy-logos',
  'academy-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'academy-covers',
  'academy-covers',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ============================================================
-- Academy logo storage policies
-- ============================================================

DROP POLICY IF EXISTS "Academy logos are publicly readable"
  ON storage.objects;

CREATE POLICY "Academy logos are publicly readable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'academy-logos');


DROP POLICY IF EXISTS "Academies can upload their own logo"
  ON storage.objects;

CREATE POLICY "Academies can upload their own logo"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'academy-logos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );


DROP POLICY IF EXISTS "Academies can replace their own logo"
  ON storage.objects;

CREATE POLICY "Academies can replace their own logo"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'academy-logos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- ============================================================
-- Academy cover storage policies
-- ============================================================

DROP POLICY IF EXISTS "Academy covers are publicly readable"
  ON storage.objects;

CREATE POLICY "Academy covers are publicly readable"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'academy-covers');


DROP POLICY IF EXISTS "Academies can upload their own cover"
  ON storage.objects;

CREATE POLICY "Academies can upload their own cover"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'academy-covers'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );


DROP POLICY IF EXISTS "Academies can replace their own cover"
  ON storage.objects;

CREATE POLICY "Academies can replace their own cover"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'academy-covers'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );