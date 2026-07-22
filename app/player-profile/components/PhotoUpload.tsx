type Props = {
  setSelectedPhoto: (file: File | null) => void;
  uploadPhoto: () => void;
  uploading: boolean;
};

export default function PhotoUpload({ setSelectedPhoto, uploadPhoto, uploading }: Props) {
  return (
    <div className="mt-6">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setSelectedPhoto(e.target.files?.[0] || null)}
      />

      <button
        onClick={uploadPhoto}
        disabled={uploading}
        className="mt-4 bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 disabled:opacity-50"
      >
        {uploading ? "Uploading..." : "Upload Photo"}
      </button>
    </div>
  );
}
