// Highlight-video upload rules (app/lib/videoUpload.ts) and how the profile
// page / components use them. No network, no database, no real upload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ALLOWED_VIDEO_TYPES,
  FREE_VIDEO_LIMIT,
  MAX_VIDEO_SIZE_BYTES,
  VIDEO_ACCEPT,
  videoFileError,
  videoStoragePath,
} from "../app/lib/videoUpload.ts";

const MB = 1024 * 1024;
const UID = "e5deb56b-d5bc-4d2e-bc72-45a9680eb508";

// === Validation matches the highlight-videos bucket ===

test("limits match the Storage bucket (52428800 bytes; mp4/quicktime/webm) and the free-tier policy (3)", () => {
  assert.equal(MAX_VIDEO_SIZE_BYTES, 52428800);
  assert.deepEqual([...ALLOWED_VIDEO_TYPES].sort(), ["video/mp4", "video/quicktime", "video/webm"]);
  assert.equal(FREE_VIDEO_LIMIT, 3);
  for (const t of ALLOWED_VIDEO_TYPES) assert.ok(VIDEO_ACCEPT.includes(t));
});

test("accepts MP4, MOV and WebM up to exactly 50 MB", () => {
  assert.equal(videoFileError({ type: "video/mp4", size: 10 * MB }), null);
  assert.equal(videoFileError({ type: "video/quicktime", size: 1 }), null);
  assert.equal(videoFileError({ type: "video/webm", size: 50 * MB }), null);
});

test("rejects files over 50 MB with the correct limit in the message", () => {
  const msg = videoFileError({ type: "video/mp4", size: 50 * MB + 1 });
  assert.match(msg, /maximum upload size is 50 MB/);
  assert.doesNotMatch(msg, /250/);
});

test("rejects formats the bucket would refuse (and non-videos)", () => {
  for (const type of ["video/x-matroska", "video/x-msvideo", "video/3gpp", "image/jpeg", "application/pdf", ""]) {
    assert.match(videoFileError({ type, size: MB }), /format is not supported/, type || "(empty type)");
  }
});

// === Storage path: owner-scoped and always a valid key ===

test("path starts with the uploader's own id (what the storage policy checks)", () => {
  const path = videoStoragePath(UID, "Goal vs Lagos.mp4", 1700000000000);
  assert.equal(path, `${UID}/1700000000000-goal-vs-lagos.mp4`);
  assert.equal(path.split("/")[0], UID);
});

test("file names can never add folders or escape the owner's folder", () => {
  for (const name of ["../../other-user/x.mp4", "a/b/c.mp4", "..\\..\\x.mp4", "/etc/passwd.mp4"]) {
    const path = videoStoragePath(UID, name, 1);
    assert.equal(path.split("/").length, 2, name);
    assert.equal(path.split("/")[0], UID, name);
  }
});

test("unusual characters are sanitised to a safe key", () => {
  assert.equal(videoStoragePath(UID, "  Été  ゴール!! (final).MOV ", 5), `${UID}/5-t-final-.mov`);
  assert.equal(videoStoragePath(UID, "ゴール", 5), `${UID}/5-video`);
  assert.match(videoStoragePath(UID, "IMG_1234.MOV", 5).split("/")[1], /^[a-z0-9.-]+$/);
});

// === Wiring in the components ===

const page = readFileSync("app/player-profile/[slug]/page.tsx", "utf8");
const uploadForm = readFileSync("app/player-profile/components/VideoUpload.tsx", "utf8");
const gallery = readFileSync("app/player-profile/components/HighlightVideos.tsx", "utf8");

test("upload form uses the shared rules (no stale limits, no video/* wildcard, no 250 MB text)", () => {
  assert.match(uploadForm, /accept=\{VIDEO_ACCEPT\}/);
  assert.match(uploadForm, /videoFileError\(file\)/);
  assert.doesNotMatch(uploadForm, /accept="video\/\*"/);
  assert.doesNotMatch(uploadForm, /250 MB/);
  assert.doesNotMatch(uploadForm, /const (FREE_VIDEO_LIMIT|MAX_VIDEO_SIZE_BYTES)\s*=/);
});

test("Premium status is real, not hard-coded to free", () => {
  assert.doesNotMatch(page, /isPremium=\{false\}/);
  assert.match(page, /isPremium=\{ownerIsPremium\}/);
  assert.match(page, /setOwnerIsPremium\(ownProfile \? await isPremium\(user\?\.id\) : false\)/);
});

test("only the profile owner sees the upload form", () => {
  assert.match(page, /\{isOwnProfile && \(\s*<VideoUpload/);
});

test("upload handler: signed-in caller, validated file, owner-scoped path, cleanup on failed insert", () => {
  const handler = page.slice(page.indexOf("async function uploadVideo"), page.indexOf("async function uploadPhoto"));
  assert.match(handler, /if \(!caller\)/);
  assert.match(handler, /videoFileError\(selectedVideo\)/);
  assert.match(handler, /videoStoragePath\(caller\.id, selectedVideo\.name\)/);
  assert.match(handler, /\.from\("highlight-videos"\)\s*\.upload\(fileName, selectedVideo\)/);
  assert.match(handler, /getPublicUrl\(fileName\)/);
  assert.match(handler, /from\("videos"\)\.insert\(\{\s*player_id: player\.user_id,\s*title: selectedVideo\.name,\s*video_url: publicUrl,/);
  assert.match(handler, /if \(error\) \{[\s\S]*\.remove\(\[fileName\]\)/);
});

test("public profile reads videos by the player's user id, newest first", () => {
  assert.match(page, /\.from\("videos"\)\s*\.select\("\*"\)\s*\.eq\("player_id", data\.user_id \|\| ""\)\s*\.order\("created_at", \{ ascending: false \}\)/);
});

test("playback: controls, metadata-only preload, inline on iPhone, stored public URL", () => {
  assert.match(gallery, /<video\s+controls\s+preload="metadata"\s+playsInline/);
  assert.match(gallery, /src=\{video\.video_url\}/);
});
