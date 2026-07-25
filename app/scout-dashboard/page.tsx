"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { isArrayOf, isPlayer } from "../lib/types";
import type { Player } from "../lib/types";

export default function ScoutDashboard() { 
    const router = useRouter();
    const [players, setPlayers] = useState<Player[]>([]);
    const [playersLoading, setPlayersLoading] = useState(true);
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
    const [verificationStatus, setVerificationStatus] = useState<
      "pending" | "verified" | "rejected" | null
    >(null);

// Defense-in-depth: proxy.ts (project-root route guard) is the primary gate for this
// route. This client-side check exists in case that layer is ever misconfigured or
// bypassed (e.g. the Next.js 16 middleware->proxy rename silently disabling it, which is
// exactly what happened during Sprint 1A testing). This is a UX/routing check only -
// user_metadata.account_type is client-editable and is never trusted for real data
// authorization, which is enforced separately by Supabase RLS.
useEffect(() => {
  async function loadWatchlistCount(scoutId: string) {
    const { count, error } = await supabase
      .from("watchlist")
      .select("*", { count: "exact", head: true })
      .eq("scout_id", scoutId);

    if (!error) {
      setWatchlistCount(count ?? 0);
    }
  }

  async function loadVerificationStatus(scoutId: string) {
    const { data } = await supabase
      .from("account_verifications")
      .select("status")
      .eq("user_id", scoutId)
      .maybeSingle();

    if (data && typeof data === "object" && "status" in data) {
      setVerificationStatus(data.status as "pending" | "verified" | "rejected");
    }
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("player")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6);

    if (!error && isArrayOf(data, isPlayer)) {
      setPlayers(data);
    }

    setPlayersLoading(false);
  }

  async function checkAccess() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/signin");
      return;
    }

    if (user.user_metadata?.account_type !== "scout") {
      router.replace("/");
      return;
    }

    setCheckingAccess(false);
    loadPlayers();
    loadWatchlistCount(user.id);
    loadVerificationStatus(user.id);
  }

  checkAccess();
}, [router]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Checking access...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto animate-fade-in">

        {/* Welcome Banner */}
<div className="bg-gradient-to-r from-green-600 to-green-800 text-white rounded-3xl p-8 mb-10 shadow-xl ring-1 ring-black/5">

  <div className="flex items-center gap-3 flex-wrap">
    <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
      Welcome back, Scout 👋
    </h1>
    <a
      href="/verification"
      className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200 ${
        verificationStatus === "verified"
          ? "bg-white/20 hover:bg-white/25"
          : "bg-white/10 hover:bg-white/20"
      }`}
    >
      {verificationStatus === "verified"
        ? "🟢 Verified"
        : verificationStatus === "rejected"
          ? "⚫ Rejected"
          : verificationStatus === "pending"
            ? "🟡 Pending Review"
            : "🔴 Not Verified"}
    </a>
  </div>

  <p className="text-xl mt-3">
    Discover. Evaluate. Connect.
  </p>

  <p className="mt-2 opacity-90">
    ScoutAfrica helps you discover Africa&apos;s next football stars.
  </p>

</div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">

          <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-200 hover:-translate-y-1">
  <h2 className="text-2xl font-bold text-gray-400">Coming Soon</h2>
  <p className="text-gray-600 mt-2">Players Viewed</p>
</div>

          <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-200 hover:-translate-y-1">
  <h2 className="text-4xl font-bold text-yellow-500 tracking-tight">
    {watchlistCount ?? "0"}
  </h2>
  <p className="text-gray-600 mt-2">⭐ Watchlist</p>
</div>

          <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-200 hover:-translate-y-1">
  <h2 className="text-2xl font-bold text-gray-400">Coming Soon</h2>
  <p className="text-gray-600 mt-2">❤️ Favorites</p>
</div>
          <div className="bg-white p-6 rounded-2xl shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-200 hover:-translate-y-1">
  <h2 className="text-2xl font-bold text-gray-400">Coming Soon</h2>
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

  {playersLoading && (
    <p className="text-gray-500 col-span-2">Loading recent players...</p>
  )}

  {!playersLoading && players.length === 0 && (
    <p className="text-gray-500 col-span-2">
      No players have registered yet. Check back soon.
    </p>
  )}

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

<p className="text-gray-500 mb-2">
  Carefully selected by the ScoutAfrica team from active subscribed members.
</p>
<p className="text-gray-400 text-sm mb-6 italic">Coming soon</p>

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

    <button
      disabled
      title="Coming soon"
      className="bg-red-300 text-white rounded-2xl p-6 shadow-lg text-center cursor-not-allowed"
    >
      <div className="text-4xl mb-2">❤️</div>
      <p className="font-semibold text-lg">Favorites</p>
      <p className="text-xs mt-1 opacity-80">Coming soon</p>
    </button>

    <Link
      href="/messages"
      className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl p-6 shadow-lg transition text-center"
    >
      <div className="text-4xl mb-2">📨</div>
      <p className="font-semibold text-lg">Messages</p>
    </Link>

  </div>
</div>

      </div>
    </main>
  );
}