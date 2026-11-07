// Profile/cover photo object names (app/lib/profileImages.ts), the edit
// page's uploads, and the Player Dashboard link to the public profile.
// No network, no database, no real upload.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coverPhotoPath, profilePhotoPath } from "../app/lib/profileImages.ts";

const MIGRATION_046 = readFileSync("supabase/migrations/046_secure_legacy_storage_buckets.sql", "utf8");

// The player id the storage policy extracts from an object name, using the
// policy's own pattern as written in migration 046.
function policyPlayerId(bucketPrefix, name) {
  const m = MIGRATION_046.match(new RegExp(`substring\\(name from '(\\^${bucketPrefix}-\\(\\\\d\\+\\)-)'\\)`));
  assert.ok(m, `policy pattern for ${bucketPrefix} not found in 046`);
  const id = name.match(new RegExp(m[1]))?.[1];
  return id === undefined ? null : Number(id);
}

// === Object names satisfy the storage ownership policies ===

test("profile photo name carries the player id the profile-photos policy checks", () => {
  assert.equal(profilePhotoPath(42, 1790355775368), "profile-42-1790355775368");
  assert.equal(policyPlayerId("profile", profilePhotoPath(42)), 42);
});

test("cover photo name carries the player id the cover-photos policy checks", () => {
  assert.equal(coverPhotoPath(28, 1790355775368), "cover-28-1790355775368");
  assert.equal(policyPlayerId("cover", coverPhotoPath(28)), 28);
});

test("names are unique per upload (timestamped), so no overwrite is ever needed", () => {
  assert.notEqual(profilePhotoPath(7, 1000), profilePhotoPath(7, 1001));
  assert.notEqual(coverPhotoPath(7, 1000), coverPhotoPath(7, 1001));
  // No folders: the name can never be placed under another prefix.
  assert.ok(!profilePhotoPath(7).includes("/") && !coverPhotoPath(7).includes("/"));
});

test("a profile name never passes the cover policy and vice versa", () => {
  assert.equal(policyPlayerId("cover", profilePhotoPath(5)), null);
  assert.equal(policyPlayerId("profile", coverPhotoPath(5)), null);
});

// === Edit Profile uploads ===

test("edit profile uploads to the policy-protected buckets with the shared names and without upsert", () => {
  const page = readFileSync("app/edit-profile/page.tsx", "utf8");
  assert.match(page, /\.from\("profile-photos"\)\s*\.upload\(fileName, selectedProfilePhoto\);/);
  assert.match(page, /\.from\("cover-photos"\)\s*\.upload\(fileName, selectedCoverPhoto\);/);
  assert.match(page, /const fileName = profilePhotoPath\(player\.id\);/);
  assert.match(page, /const fileName = coverPhotoPath\(player\.id\);/);
  assert.doesNotMatch(page, /upsert\s*:\s*true/);
});

// === Player Dashboard -> public profile (where the video upload form is) ===

test("player dashboard links to the player's own public profile by slug", () => {
  const page = readFileSync("app/player-dashboard/page.tsx", "utf8");
  assert.match(
    page,
    /\{player\.slug && \(\s*<Link\s+href=\{`\/player-profile\/\$\{player\.slug\}`\}[\s\S]*?View My Public Profile\s*<\/Link>/
  );
  // The dashboard still loads only public columns (slug is one of them).
  assert.match(page, /\.select\(PLAYER_PUBLIC_COLUMNS\)/);
});

test("the linked profile page is where the owner's video upload form renders", () => {
  const page = readFileSync("app/player-profile/[slug]/page.tsx", "utf8");
  assert.match(page, /\.eq\("slug", slug\)/);
  assert.match(page, /\{isOwnProfile && \(\s*<VideoUpload/);
});
