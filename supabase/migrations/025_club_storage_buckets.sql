-- Migration: 025_club_storage_buckets
-- ScoutAfrica: Club logo/cover storage
--
-- Mirrors the existing profile-photos/cover-photos pattern (separate
-- public buckets per image type) rather than inventing a new convention.
-- Public, like the existing player media buckets - club branding images
-- are meant to be publicly visible, unlike message-files (private) or
-- club_private_info (owner-only).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-logos', 'club-logos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('club-covers', 'club-covers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read (matches existing player photo buckets); upload/replace
-- restricted to authenticated users uploading under their own user_id
-- folder path, consistent with the video/photo upload conventions
-- already used elsewhere in this project.
DROP POLICY IF EXISTS "Club logos are publicly readable" ON storage.objects;
CREATE POLICY "Club logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-logos');

DROP POLICY IF EXISTS "Clubs can upload their own logo" ON storage.objects;
CREATE POLICY "Clubs can upload their own logo"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'club-logos' AND (storage.foldername(name))[1] = (select auth.uid())::text);

DROP POLICY IF EXISTS "Clubs can replace their own logo" ON storage.objects;
CREATE POLICY "Clubs can replace their own logo"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'club-logos' AND (storage.foldername(name))[1] = (select auth.uid())::text);

DROP POLICY IF EXISTS "Club covers are publicly readable" ON storage.objects;
CREATE POLICY "Club covers are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'club-covers');

DROP POLICY IF EXISTS "Clubs can upload their own cover" ON storage.objects;
CREATE POLICY "Clubs can upload their own cover"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'club-covers' AND (storage.foldername(name))[1] = (select auth.uid())::text);

DROP POLICY IF EXISTS "Clubs can replace their own cover" ON storage.objects;
CREATE POLICY "Clubs can replace their own cover"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'club-covers' AND (storage.foldername(name))[1] = (select auth.uid())::text);
