"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";

export default function WatchlistPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    loadWatchlist();
  }, []);  



  async function loadWatchlist() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: watchlist, error } = await supabase
      .from("watchlist")
      .select("player_id")
      .eq("scout_id", user.id);

    if (error) {
      console.error(error);
      setLoading(false);
      return;
    }

    if (!watchlist || watchlist.length === 0) {
      setPlayers([]);
      setLoading(false);
      return;
    }

    const playerIds = watchlist.map((item) => item.player_id);

    const { data: playerData } = await supabase
      .from("player")
      .select("*")
      .in("id", playerIds);

    setPlayers(playerData || []);
    setLoading(false);
  }   

  async function removeFromWatchlist(playerId: number) {
  setRemoving(playerId);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("scout_id", user.id)
    .eq("player_id", playerId);

  if (error) {
    alert(error.message);
  } else {
    setPlayers(players.filter((p) => p.id !== playerId));
  }

  setRemoving(null);
}

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Loading Watchlist...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">

        <h1 className="text-4xl font-bold mb-8">
          ⭐ My Watchlist
        </h1>

        {players.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center shadow">
            <h2 className="text-2xl font-semibold">
              No players saved yet.
            </h2>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {players.map((player) => (
              <div
                key={player.id}
                className="bg-white rounded-2xl shadow-lg p-6"
              >
                <h2 className="text-2xl font-bold">
                  {player.full_name}
                </h2>

                <p className="mt-2">⚽ {player.position}</p>
                <p>🌍 {player.nationality}</p>
                <p>🎂 Age {player.age}</p>

                <div className="flex gap-3 mt-5">

  <Link
    href={`/player-profile/${player.slug}`}
    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg"
  >
    View Profile
  </Link>

  <button
    onClick={() => removeFromWatchlist(player.id)}
    className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-lg"
    disabled={removing === player.id}
  >
    {removing === player.id ? "Removing..." : "Remove"}
  </button>

</div>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}