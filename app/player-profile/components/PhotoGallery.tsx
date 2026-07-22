import Image from "next/image";
import type { PlayerPhoto } from "../../lib/types";

type Props = {
  photos: PlayerPhoto[];
};

export default function PhotoGallery({ photos }: Props) {
  return (
    <div className="mt-10">
      <h2 className="text-2xl font-bold mb-6">Photo Gallery</h2>

      {photos.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-6">
          No photos uploaded yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden shadow bg-gray-100">
              <Image
                src={photo.photo_url}
                alt={photo.caption || "Player photo"}
                fill
                className="object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
