"use client";

import type { Player } from "../../lib/types";

type Props = {
  player: Player;
  addToWatchlist: (playerId: number) => void;
  savingWatchlist: boolean;
};

export default function PlayerHeader({
  player,
  addToWatchlist,
  savingWatchlist,
  }: Props) {
  return (
    <div className="mb-10">

      {/* Cover Photo */}
      <div className="relative w-full h-[420px] rounded-3xl overflow-hidden shadow-xl">
        {player.cover_photo_url ? (
          <img
            src={player.cover_photo_url || undefined}
            alt="Cover"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-blue-700 via-sky-500 to-cyan-400" />
        )}
      </div>

      <div className="relative px-10">

        {/* Profile Photo */}
        <div className="-mt-28">
          <div className="w-56 h-56 rounded-full border-4 border-white overflow-hidden shadow-xl bg-white">
            {player.photo_url ? (
              <img
                src={player.photo_url || undefined}
                alt={player.full_name || "Player"}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                No Photo
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">

          {/* Player Card */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg p-6">

            <h1 className="text-5xl font-bold">
              {player.full_name}
            </h1>

            {player.verified ? (
              <p className="text-green-600 text-xl font-semibold mt-4">
                ✔ Verified ScoutAfrica Player
              </p>
            ) : (
              <p className="text-gray-500 text-xl font-semibold mt-4">
                Verification Pending
              </p>
            )}

            <div className="mt-5">
              <p className="text-xl">
                <strong>ScoutAfrica ID:</strong> {player.scoutafrica_id}
              </p>
            </div>

            <div className="flex flex-wrap gap-4 mt-8">

              <button
                onClick={() => addToWatchlist(player.id)}
                disabled={savingWatchlist}
                className="px-5 py-3 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 transition"
              >
                ⭐ {savingWatchlist ? "Saving..." : "Add to Watchlist"}
              </button>

              
            </div>

          </div>

          {/* Contact Card */}
          <div className="bg-white rounded-2xl shadow-lg p-6">

            <h2 className="text-2xl font-bold mb-5">
              Contact Player
            </h2>

            <button
              onClick={() => (window.location.href = "/messages")}
              className="w-full text-left p-3 rounded-lg hover:bg-gray-100 mb-2"
            >
              💬 Message Player
            </button>

            <button
  onClick={() =>
    window.location.href = `/express-interest?player=${player.id}`
  }
  className="w-full text-left p-3 rounded-lg hover:bg-green-100 mb-2"
>
  📅 Invite to Trial
</button>

            <button
              disabled
              title="Coming soon"
              className="w-full text-left p-3 rounded-lg text-gray-400 cursor-not-allowed mb-2"
            >
              ❤️ Favorite Player (Coming Soon)
            </button>

            <hr className="my-5" />

            {player.verified ? (
              <div className="text-green-700 font-semibold">
                🛡 100% Verified by ScoutAfrica
              </div>
            ) : (
              <div className="text-gray-500 font-semibold">
                🛡 Verification Pending
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}