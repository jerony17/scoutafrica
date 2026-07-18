type Props = {
  videos: any[];
};

export default function HighlightVideos({ videos }: Props) { 
    
  return (
    <div className="mt-10">

      <h2 className="text-2xl font-bold mb-6">
        Highlight Videos
      </h2>

      {videos.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-6">
          No highlight videos uploaded yet.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {videos.map((video) => (
            <div
              key={video.id}
              className="bg-white rounded-xl shadow p-4"
            >
              <video
                controls
                className="w-full rounded-lg"
                src={video.video_url}
              />

              <p className="mt-3 font-semibold">
                {video.title}
              </p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}