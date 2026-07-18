export default function VideoShowcase() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">

        <h1 className="text-5xl font-bold text-green-700 mb-8">
          Video Showcase
        </h1>

        <div className="bg-white p-6 rounded-2xl shadow-md mb-8">
          <h2 className="text-2xl font-bold mb-4">
            Upload Highlight Video
          </h2>

          <input
            type="text"
            placeholder="Paste YouTube Video Link"
            className="w-full border p-3 rounded-lg mb-4"
          />

          <button className="bg-green-600 text-white px-6 py-3 rounded-lg">
            Upload Video
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">

          <div className="bg-white rounded-2xl shadow-md p-4">
            <h3 className="text-xl font-bold mb-2">
              Match Highlights
            </h3>

            <div className="bg-gray-200 h-56 rounded-lg flex items-center justify-center">
              VIDEO PREVIEW
            </div>

            <p className="mt-3 text-gray-600">
              FC Bombonera vs Gifu United
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-md p-4">
            <h3 className="text-xl font-bold mb-2">
              Skills Compilation
            </h3>

            <div className="bg-gray-200 h-56 rounded-lg flex items-center justify-center">
              VIDEO PREVIEW
            </div>

            <p className="mt-3 text-gray-600">
              Jerome Abah Skills 2026
            </p>
          </div>

        </div>

      </div>
    </main>
  );
}