// Highlight-video upload rules shared by the upload form
// (player-profile/components/VideoUpload.tsx) and the upload handler
// (player-profile/[slug]/page.tsx). No runtime imports - unit-tested in
// tests/videoUpload.test.mjs.

// Must match the highlight-videos Storage bucket: file_size_limit
// 52428800 bytes and allowed_mime_types (checked in Production). The
// bucket enforces both; checking first gives the player a clear message
// instead of a failed upload.
export const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const VIDEO_ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

// Enforced server-side by the videos INSERT policy "Free players are
// limited to 3 highlight videos" (Premium players are unlimited).
export const FREE_VIDEO_LIMIT = 3;

export function videoFileError(file: { size: number; type: string }): string | null {
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return "This video format is not supported. Please upload an MP4 (recommended), MOV or WebM file.";
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return "This video is too large. The maximum upload size is 50 MB. Please compress your video or upload a shorter highlight reel.";
  }
  return null;
}

// Owner-scoped Storage path: the first segment must be the uploader's own
// auth id (the storage policy checks exactly that). The file name is
// sanitised the same way register-player sanitises photo names, so
// spaces, accents or symbols can never produce an invalid Storage key.
export function videoStoragePath(userId: string, fileName: string, now: number = Date.now()): string {
  const safeName = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${userId}/${now}-${safeName || "video"}`;
}
