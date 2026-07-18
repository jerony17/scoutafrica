"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

export default function ScoutDashboard() { 
    const [players, setPlayers] = useState<any[]>([]);

useEffect(() => {
  loadPlayers();
}, []);

async function loadPlayers() {
  const { data, error } = await supabase
    .from("player")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(6);

  if (!error && data) {
    setPlayers(data);
  }
}
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">

        {/* Welcome Banner */}
<div className="bg-gradient-to-r from-green-600 to-green-800 text-white rounded-3xl p-8 mb-10 shadow-xl">

  <h1 className="text-4xl md:text-5xl font-bold">
    Welcome back, Scout 👋
  </h1>

  <p className="text-xl mt-3">
    Discover. Evaluate. Connect.
  </p>

  <p className="mt-2 opacity-90">
    ScoutAfrica helps you discover Africa's next football stars.
  </p>

</div>

        <div className="grid md:grid-cols-4 gap-6 mb-8">

          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition">
  <h2 className="text-4xl font-bold text-green-600">356</h2>
  <p className="text-gray-600 mt-2">Players Viewed</p>
</div>

          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition">
  <h2 className="text-4xl font-bold text-green-600">45</h2>
  <p className="text-gray-600 mt-2">Saved Players</p>
</div>

          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition">
  <h2 className="text-4xl font-bold text-yellow-500">18</h2>
  <p className="text-gray-600 mt-2">⭐ Watchlist</p>
</div>
          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition">
  <h2 className="text-4xl font-bold text-green-600">7</h2>
  <p className="text-gray-600 mt-2">Active Trials</p>
</div>

        </div>

        <div className="bg-white rounded-2xl shadow-md p-6">

          

          <div className="space-y-4">

            
             <h2 className="text-3xl font-bold mb-6">
  🆕 Recently Registered Players
</h2>

<p className="text-gray-500 mb-6">
  Discover the latest football talent that has recently joined ScoutAfrica.
</p>

    <div className="grid md:grid-cols-2 gap-5">

  {players.map((player) => (

    <div
      key={player.id}
      className="bg-white rounded-2xl shadow-lg p-5 hover:shadow-xl transition"
    >

      <h3 className="text-xl font-bold">
        {player.full_name}
      </h3>

      <p className="text-gray-600 mt-2">
        ⚽ {player.position}
      </p>

      <p className="text-gray-600">
        🌍 {player.nationality}
      </p>

      <p className="text-gray-600">
        🎂 Age {player.age}
      </p>

      <Link
        href={`/player-profile/${player.slug}`}
        className="inline-block mt-4 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg"
      >
        View Profile
      </Link>

    </div>

  ))}

</div>

<h2 className="text-3xl font-bold mt-12 mb-6">
  ⭐ ScoutAfrica Featured Players
</h2>

<p className="text-gray-500 mb-6">
  Carefully selected by the ScoutAfrica team from active subscribed members.
</p>

<div className="grid md:grid-cols-2 gap-5">

  {/* Featured players will come from Supabase */}

</div>

          </div>

        </div>

      <div className="mt-10">
  <h2 className="text-3xl font-bold mb-6">
    Quick Actions
  </h2>

  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">

    <a
      href="/find-players"
      className="bg-green-600 hover:bg-green-700 text-white rounded-2xl p-6 text-center shadow-lg transition"
    >
      <div className="text-4xl mb-2">🔍</div>
      <p className="font-semibold text-lg">Find Players</p>
    </a>

    <Link
  href="/scout-dashboard/watchlist"
  className="bg-yellow-500 hover:bg-yellow-600 text-white rounded-2xl p-6 shadow-lg transition text-center"
>
  <div className="text-4xl mb-2">⭐</div>
  <p className="font-semibold text-lg">Watchlist</p>
</Link>

    <button className="bg-red-500 hover:bg-red-600 text-white rounded-2xl p-6 shadow-lg transition">
      <div className="text-4xl mb-2">❤️</div>
      <p className="font-semibold text-lg">Favorites</p>
    </button>

    <button className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl p-6 shadow-lg transition">
      <div className="text-4xl mb-2">📨</div>
      <p className="font-semibold text-lg">Messages</p>
    </button>

  </div>
</div>

      </div>
    </main>
  );
}