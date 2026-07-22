type Props = {
  setSelectedVideo: (file: File | null) => void;
  uploadVideo: () => void;
  uploading: boolean;
};

export default function VideoUpload({
  setSelectedVideo,
  uploadVideo,
  uploading,
}: Props) {
  return (
    <div className="mt-10">

      <h2 className="text-2xl font-bold mb-4">
        Upload Highlight Video
      </h2>

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

    </div>
  );
}