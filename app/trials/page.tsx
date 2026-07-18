export default function TrialsPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">

        <h1 className="text-5xl font-bold text-green-700 mb-8">
          Trial Invitations
        </h1>

        <div className="space-y-6">

          <div className="bg-white rounded-2xl shadow-md p-6">

            <h2 className="text-2xl font-bold">
              FC Bombonera
            </h2>

            <p className="mt-2">
              Position: Midfielder
            </p>

            <p>
              Location: Gifu, Japan
            </p>

            <p>
              Trial Date: July 15, 2026
            </p>

            <div className="flex gap-4 mt-6">

              <button className="bg-green-600 text-white px-6 py-3 rounded-lg">
                Accept
              </button>

              <button className="bg-red-600 text-white px-6 py-3 rounded-lg">
                Decline
              </button>

            </div>

          </div>

          <div className="bg-white rounded-2xl shadow-md p-6">

            <h2 className="text-2xl font-bold">
              Lagos Academy
            </h2>

            <p className="mt-2">
              Position: Midfielder
            </p>

            <p>
              Location: Lagos, Nigeria
            </p>

            <p>
              Trial Date: August 2, 2026
            </p>

            <div className="flex gap-4 mt-6">

              <button className="bg-green-600 text-white px-6 py-3 rounded-lg">
                Accept
              </button>

              <button className="bg-red-600 text-white px-6 py-3 rounded-lg">
                Decline
              </button>

            </div>

          </div>

        </div>

      </div>
    </main>
  );
}