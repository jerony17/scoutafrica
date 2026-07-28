type Props = {
  setSelectedVideo: (file: File | null) => void;
  uploadVideo: () => void;
  uploading: boolean;
  videoCount: number;
  isPremium: boolean;
};

const FREE_VIDEO_LIMIT = 3;

// Deliberately NOT wrapped in PremiumGuard - free users genuinely have
// real upload access (up to FREE_VIDEO_LIMIT), matching the RLS policy
// that actually enforces this limit server-side. The upload UI shows
// normally below the limit; only once it's reached does this switch to
// an upgrade prompt in place of the form.
export default function VideoUpload({
  setSelectedVideo,
  uploadVideo,
  uploading,
  videoCount,
  isPremium,
}: Props) {
  const atLimit = !isPremium && videoCount >= FREE_VIDEO_LIMIT;

  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-1">
        Upload Highlight Video
      </h2>

      {!isPremium && (
        <p className="text-sm text-gray-500 mb-4">
          {videoCount}/{FREE_VIDEO_LIMIT} free uploads used
        </p>
      )}

      {atLimit ? (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6 text-center mt-2">
          <p className="text-amber-800 font-medium mb-1">
            ⭐ You&apos;ve used all {FREE_VIDEO_LIMIT} free video uploads.
          </p>
          <p className="text-amber-700 text-sm mb-4">
            Upgrade to ScoutAfrica Premium for unlimited highlight video uploads.
          </p>
          <a
            href="/membership"
            className="inline-block bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
          >
            Upgrade to Premium
          </a>
        </div>
      ) : (
        <>
          <input
            type="file"
            accept="video/*"
            onChange={(e) =>
              setSelectedVideo(e.target.files?.[0] || null)
            }
          />

          <button
            onClick={uploadVideo}
            disabled={uploading}
            className="mt-4 bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700"
          >
            {uploading ? "Uploading..." : "Upload Video"}
          </button>
        </>
      )}
    </div>
  );
}