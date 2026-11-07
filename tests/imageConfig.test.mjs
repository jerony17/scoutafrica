// next/image remote patterns (next.config.ts) for player images stored in
// Supabase Storage: profile photos, cover photos and the photo gallery.
// URLs are produced by the real Supabase Storage client (getPublicUrl, no
// network) with the same buckets and object names the app uploads, and are
// matched with Next.js's own matcher - the check its image optimiser runs
// before answering 200 or 400 ("url" parameter is not allowed).
// next.config.ts is loaded in a fresh Node process per environment, as a
// build loads it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { StorageClient } from "@supabase/storage-js";
import { coverPhotoPath, profilePhotoPath } from "../app/lib/profileImages.ts";
import { videoStoragePath } from "../app/lib/videoUpload.ts";

const require = createRequire(import.meta.url);
const { hasRemoteMatch } = require("next/dist/shared/lib/match-remote-pattern");

const TEST_URL = "https://gdoadajmggmawiiyoaus.supabase.co";
const PRODUCTION_URL = "https://dbleskorympnnhekbkgo.supabase.co";
const UID = "d2fa8740-bc0f-472b-9aaf-f3dd0c7de49f";

function remotePatterns(env) {
  const script =
    "const c = (await import('./next.config.ts')).default;" +
    "process.stdout.write('\\n' + JSON.stringify(c.images.remotePatterns));";
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split("\n").pop());
}

function allowed(patterns, url) {
  return hasRemoteMatch([], patterns, new URL(url));
}

// The public URL the app stores, generated exactly as the app does.
function publicUrl(projectUrl, bucket, path) {
  return new StorageClient(`${projectUrl}/storage/v1`, {}).from(bucket).getPublicUrl(path).data.publicUrl;
}

// Every image the app stores and renders with next/image.
function appImageUrls(projectUrl) {
  return {
    "profile photo": publicUrl(projectUrl, "profile-photos", profilePhotoPath(5, 1794050656506)),
    "cover photo": publicUrl(projectUrl, "cover-photos", coverPhotoPath(5, 1794050638844)),
    "gallery photo (name with spaces)": publicUrl(projectUrl, "player-photos", `${UID}/1794050765253-hero image 3.png`),
    "registration photo": publicUrl(projectUrl, "player-photos", `${UID}/1794039701779-m1.jpg`),
  };
}

// === Test project (Previews and local development) ===

test("test project: profile, cover and gallery photo URLs are allowed by next/image", () => {
  const patterns = remotePatterns({ NEXT_PUBLIC_SUPABASE_URL: TEST_URL });
  for (const [label, url] of Object.entries(appImageUrls(TEST_URL))) {
    assert.ok(url.startsWith(`${TEST_URL}/storage/v1/object/public/`), `${label}: ${url}`);
    assert.equal(allowed(patterns, url), true, `${label} must be allowed: ${url}`);
  }
});

test("Preview build on the test project: same images allowed (guard still passes)", () => {
  const patterns = remotePatterns({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: TEST_URL });
  for (const url of Object.values(appImageUrls(TEST_URL))) assert.equal(allowed(patterns, url), true, url);
});

test("only public Storage objects are allowed - no signed/private paths, other APIs, query strings or other hosts", () => {
  const patterns = remotePatterns({ NEXT_PUBLIC_SUPABASE_URL: TEST_URL });
  for (const url of [
    `${TEST_URL}/storage/v1/object/sign/profile-photos/profile-5-1.jpg`,
    `${TEST_URL}/storage/v1/object/authenticated/profile-photos/profile-5-1.jpg`,
    `${TEST_URL}/storage/v1/object/public/profile-photos/profile-5-1.jpg?download=1`,
    `${TEST_URL}/rest/v1/player`,
    `${TEST_URL}/auth/v1/user`,
    `http://gdoadajmggmawiiyoaus.supabase.co/storage/v1/object/public/profile-photos/profile-5-1.jpg`,
    "https://otherprojectref.supabase.co/storage/v1/object/public/profile-photos/profile-5-1.jpg",
    "https://evil.example.com/storage/v1/object/public/profile-photos/profile-5-1.jpg",
  ]) {
    assert.equal(allowed(patterns, url), false, `must be refused: ${url}`);
  }
});

// === Production behaviour is unchanged ===

test("production build: production Storage images allowed, test-project images not", () => {
  const patterns = remotePatterns({ NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL });
  for (const url of Object.values(appImageUrls(PRODUCTION_URL))) assert.equal(allowed(patterns, url), true, url);
  for (const url of Object.values(appImageUrls(TEST_URL))) assert.equal(allowed(patterns, url), false, url);
});

test("no Supabase URL set: falls back to the production host only, as before", () => {
  const patterns = remotePatterns({});
  assert.equal(allowed(patterns, appImageUrls(PRODUCTION_URL)["profile photo"]), true);
  assert.equal(allowed(patterns, appImageUrls(TEST_URL)["profile photo"]), false);
});

test("the existing image hosts are still allowed", () => {
  const patterns = remotePatterns({ NEXT_PUBLIC_SUPABASE_URL: TEST_URL });
  for (const url of [
    "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400",
    "https://via.placeholder.com/150",
    "https://placehold.co/400x400",
    `${PRODUCTION_URL}/storage/v1/object/public/profile-photos/profile-28-1.jpg`,
  ]) {
    assert.equal(allowed(patterns, url), true, url);
  }
});

// === Display: each image is rendered from the stored URL by next/image ===

test("profile header, gallery and edit page render the stored URLs through next/image (optimiser, not raw <img>)", () => {
  const header = readFileSync("app/player-profile/components/PlayerHeader.tsx", "utf8");
  assert.match(header, /<Image\s+src=\{player\.cover_photo_url \|\| "\/images\/default-cover\.jpg"\}/);
  assert.match(header, /<Image\s+src=\{player\.photo_url\}/);
  const gallery = readFileSync("app/player-profile/components/PhotoGallery.tsx", "utf8");
  assert.match(gallery, /<Image\s+src=\{photo\.photo_url\}/);
  const edit = readFileSync("app/edit-profile/page.tsx", "utf8");
  assert.match(edit, /player\.cover_photo_url \|\|/);
  for (const text of [header, gallery, edit]) {
    assert.doesNotMatch(text, /<img\s/);
    assert.doesNotMatch(text, /\bunoptimized\b/);
  }
});

test("the public profile reads the image fields and the gallery by the player's user id", () => {
  const page = readFileSync("app/player-profile/[slug]/page.tsx", "utf8");
  assert.match(page, /\.select\(\s*"[^"]*\bphoto_url\b[^"]*\bcover_photo_url\b[^"]*"/);
  assert.match(page, /\.from\("player_photos"\)\s*\.select\("\*"\)\s*\.eq\("player_id", data\.user_id \|\| ""\)/);
});

// === Videos are unaffected (played by <video>, not next/image) ===

test("highlight videos still play directly from Storage, allowed by the CSP media-src", async () => {
  const videos = readFileSync("app/player-profile/components/HighlightVideos.tsx", "utf8");
  assert.match(videos, /<video[\s\S]*?src=\{video\.video_url\}/);
  const url = publicUrl(TEST_URL, "highlight-videos", videoStoragePath(UID, "welcome video.mov", 1));
  assert.ok(url.startsWith(`${TEST_URL}/storage/v1/object/public/highlight-videos/${UID}/`));
});
