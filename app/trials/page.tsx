export default function TrialsPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md p-8 sm:p-12 text-center">
        <div className="text-6xl mb-4">🎟️</div>

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-4">
          Trial Marketplace - Coming Soon
        </h1>

        <p className="text-gray-600 max-w-lg mx-auto mb-8">
          We&apos;re building a full trial marketplace where clubs can post open
          trials and players can apply directly. This feature is coming in an
          upcoming release.
        </p>

        <a
          href="/find-players"
          className="inline-block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold"
        >
          Browse Players Now
        </a>
      </div>
    </main>
  );
}
