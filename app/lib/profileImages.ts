// Storage object names for the player's profile and cover photos, used by
// edit-profile/page.tsx. No runtime imports - unit-tested in
// tests/profileImages.test.mjs.
//
// The profile-photos / cover-photos storage policies
// (supabase/migrations/046_secure_legacy_storage_buckets.sql) only allow a
// name of the form profile-<player.id>-... / cover-<player.id>-... where
// that player row belongs to the caller. The timestamp makes every name
// unique, so uploads never need to overwrite an existing object (no upsert).
export function profilePhotoPath(playerId: number, now: number = Date.now()): string {
  return `profile-${playerId}-${now}`;
}

export function coverPhotoPath(playerId: number, now: number = Date.now()): string {
  return `cover-${playerId}-${now}`;
}
