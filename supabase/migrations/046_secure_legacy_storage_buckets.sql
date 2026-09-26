-- Migration: 046_secure_legacy_storage_buckets
--
-- SECURITY FIX (ScoutAfrica Security Release 1): closes the confirmed
-- storage vulnerabilities found in the read-only security audit, for the
-- four storage buckets that predate this project's tracked migration
-- history (player-photos, profile-photos, cover-photos, highlight-videos).
-- Every other bucket in this schema (club-*, agent-*, academy-*,
-- verification-documents, message-files, support-attachments) already
-- correctly scopes writes with a per-uploader folder path
-- ((storage.foldername(name))[1] = auth.uid()::text). These four never
-- adopted that convention and, before this migration, had no ownership
-- restriction at all - and for player-photos specifically, no
-- authentication requirement whatsoever (literally anonymous/public
-- upload was allowed).
--
-- ARCHITECTURE (revised after a follow-up read-only design review):
--
--   profile-photos / cover-photos: existing object names already embed
--   the uploader's own `player.id` (`profile-<id>-...` / `cover-<id>-...`,
--   confirmed live, e.g. "cover-28-1790355775368"). Ownership is enforced
--   by extracting that id with a regexp and confirming, via public.player,
--   that the row's user_id is the caller. No upload path changes for
--   these two buckets - existing application code already produces
--   filenames this policy understands.
--
--   player-photos / highlight-videos: existing legacy object names carry
--   no identifying information at all (flat root-level filenames like
--   "action photo 1.jpeg" or "1782380490452-Ikeda suji.jpeg" - no id, no
--   folder). Per the follow-up design review, NEW uploads from this
--   release forward use a `<auth.uid()>/<timestamp>-<filename>` path
--   (app/register-player/page.tsx and app/player-profile/[slug]/page.tsx
--   were updated in this same release to build paths this way, using the
--   real authenticated caller's own id). Ownership is enforced via
--   (storage.foldername(name))[1] = auth.uid()::text - the first path
--   segment.
--
--   Legacy objects in player-photos/highlight-videos are flat (no "/"),
--   so (storage.foldername(name))[1] evaluates to NULL for every one of
--   them, which can never equal a real auth.uid(). This structurally
--   excludes every legacy object from every INSERT/UPDATE/DELETE policy
--   below - nobody (including the original uploader) can write, replace,
--   or delete a legacy object through these policies. They are not
--   moved, renamed, or rewritten by this migration, and remain publicly
--   readable via the bucket's unchanged public=true flag and their
--   existing, unchanged stored URLs (the database stores full absolute
--   public URLs, never a path it reconstructs, so nothing downstream is
--   affected by this path-format change for new uploads).
--
-- No UPDATE/DELETE policy is added for profile-photos/cover-photos
-- beyond what already existed in the first version of this migration.
-- BUCKET CONFIG (images 5MB / jpeg,png,webp; video 50MB / mp4,quicktime,
-- webm) is unchanged from the first version of this migration - matches
-- limits already established elsewhere in this codebase (club/agent/
-- academy image buckets; VideoUpload.tsx's existing 50MB client-side
-- limit) - see the original migration history/PR notes for that
-- reasoning in full.
--
-- Public READ is left untouched on all four buckets (still `public =
-- true`).

-- ============================================================
-- player-photos
-- ============================================================

-- CRITICAL FIX: remove the fully public (anonymous, unauthenticated)
-- INSERT policy - this was the audit's critical finding.
DROP POLICY IF EXISTS "Allow public uploads l7f019_0" ON storage.objects;
-- Remove the unscoped "any authenticated user" policy from the first
-- draft of this migration (never applied live) in favor of the
-- folder-owned version below.
DROP POLICY IF EXISTS "Authenticated users can upload player photos" ON storage.objects;

-- SELECT is required here (not just for public reads, which already work
-- via the bucket's public=true flag) because the authenticated Storage
-- API operations UPDATE/DELETE use internally need a real SELECT policy
-- to locate/target a row - without one, even the true owner cannot
-- update or delete their own new-style object. Discovered via live
-- testing after the first apply of this migration; added as a follow-up
-- statement rather than rewriting history. Scoped to the owner only, so
-- it does not grant any broader visibility than the owner already has of
-- their own objects. Legacy (flat, no-folder) objects are never matched
-- (folder extraction returns NULL for them) and remain visible only via
-- the unchanged public bucket flag, exactly as before.
DROP POLICY IF EXISTS "Users can view their own player photo" ON storage.objects;
CREATE POLICY "Users can view their own player photo"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can upload their own player photo" ON storage.objects;
CREATE POLICY "Users can upload their own player photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can replace their own player photo" ON storage.objects;
CREATE POLICY "Users can replace their own player photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete their own player photo" ON storage.objects;
CREATE POLICY "Users can delete their own player photo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'player-photos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'player-photos';

-- ============================================================
-- profile-photos  (unchanged from the first version of this migration)
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated uploads to profile-photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder yndkpx_0" ON storage.objects;

DROP POLICY IF EXISTS "Players can upload their own profile photo" ON storage.objects;
CREATE POLICY "Players can upload their own profile photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^profile-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Players can replace their own profile photo" ON storage.objects;
CREATE POLICY "Players can replace their own profile photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^profile-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^profile-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Players can delete their own profile photo" ON storage.objects;
CREATE POLICY "Players can delete their own profile photo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^profile-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  );

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'profile-photos';

-- ============================================================
-- cover-photos  (unchanged from the first version of this migration)
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can upload cover photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update cover photos" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder 1w4a6hj_0" ON storage.objects;

DROP POLICY IF EXISTS "Players can upload their own cover photo" ON storage.objects;
CREATE POLICY "Players can upload their own cover photo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cover-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^cover-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Players can replace their own cover photo" ON storage.objects;
CREATE POLICY "Players can replace their own cover photo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cover-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^cover-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'cover-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^cover-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Players can delete their own cover photo" ON storage.objects;
CREATE POLICY "Players can delete their own cover photo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'cover-photos'
    AND EXISTS (
      SELECT 1 FROM public.player p
      WHERE p.id = substring(name from '^cover-(\d+)-')::bigint
        AND p.user_id = (select auth.uid())
    )
  );

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'cover-photos';

-- ============================================================
-- highlight-videos
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can upload highlight videos" ON storage.objects;

-- See the matching comment on player-photos' SELECT policy above.
DROP POLICY IF EXISTS "Users can view their own highlight video" ON storage.objects;
CREATE POLICY "Users can view their own highlight video"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'highlight-videos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can upload their own highlight video" ON storage.objects;
CREATE POLICY "Users can upload their own highlight video"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'highlight-videos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can replace their own highlight video" ON storage.objects;
CREATE POLICY "Users can replace their own highlight video"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'highlight-videos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'highlight-videos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Users can delete their own highlight video" ON storage.objects;
CREATE POLICY "Users can delete their own highlight video"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'highlight-videos'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY['video/mp4', 'video/quicktime', 'video/webm']
WHERE id = 'highlight-videos';
