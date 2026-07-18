"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function PlayerDashboard() {
  const router = useRouter();
  const [player, setPlayer] = useState<any>(null);

const [matches, setMatches] = useState(0);
const [goals, setGoals] = useState(0);
const [assists, setAssists] = useState(0);
const [profileComplete, setProfileComplete] = useState(20);

  useEffect(() => {
    loadPlayer();
  }, []);

  async function loadPlayer() {
    // Get logged in user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Defense-in-depth: proxy.ts is the primary route guard for this page. This check
    // exists in case that layer is misconfigured (see Sprint 1A follow-up investigation).
    // user_metadata.account_type is a UX/routing check only, never a security boundary.
    if (!user) {
      router.replace("/signin");
      return;
    }

    if (user.user_metadata?.account_type !== "player") {
      router.replace("/");
      return;
    }

    // Find player profile using email
    const { data } = await supabase
      .from("player")
      .select("*")
      .eq("email", user.email)
      .single();

    if (data) {
    setPlayer(data);
    loadPlayerStats(data.id);

    let score = 0;

    if (data.full_name) score += 10;
    if (data.photo_url) score += 10;
    if (data.position) score += 10;
    if (data.current_club) score += 10;
    if (data.nationality) score += 10;
    if (data.age) score += 10;
    if (data.height) score += 10;
    if (data.weight) score += 10;
    if (data.bio) score += 10;
    if (data.preferred_foot) score += 10;

    setProfileComplete(score);
}

  }
async function loadPlayerStats(playerId: number) {
  const { data, error } = await supabase
    .from("career_history")
    .select("*")
    .eq("player_id", playerId);

  if (error) {
    console.error(error);
    return;
  }

  const totalMatches =
    data?.reduce((sum, club) => sum + Number(club.appearances || 0), 0) || 0;

  const totalGoals =
    data?.reduce((sum, club) => sum + Number(club.goals || 0), 0) || 0;

  const totalAssists =
    data?.reduce((sum, club) => sum + Number(club.assists || 0), 0) || 0;

  setMatches(totalMatches);
  setGoals(totalGoals);
  setAssists(totalAssists);
}

  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center text-2xl">
        Loading Dashboard...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">

        <h1 className="text-4xl font-bold text-green-700 mb-8">
          Player Dashboard
        </h1>

        <div className="bg-white rounded-2xl shadow-md p-6 mb-8">

          <div className="flex items-center gap-6">

            <img
              src={player.photo_url}
              className="w-28 h-28 rounded-full object-cover"
            />

            <div>

              <h2 className="text-3xl font-bold">
                {player.full_name}
              </h2>

              <p>
                ScoutAfrica ID:
                <strong> {player.scoutafrica_id}</strong>
              </p>

              {player.verified ? (
  <p className="text-green-600 font-semibold">
    ✓ Verified Player
  </p>
) : (
  <p className="text-gray-500">
    Verification Pending
  </p>
)}

              <p>Position: {player.position}</p>

              <p>Nationality: {player.nationality}</p>

              <p>Current Club: {player.current_club}</p>

            </div>

          </div>

        </div>

        <div className="grid grid-cols-4 gap-6">

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-3xl font-bold text-green-600">
              {matches}
          </h3>
            <p>Matches</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-3xl font-bold text-green-600">
              {goals}
            </h3>
            <p>Goals</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-3xl font-bold text-green-600">
              {assists}
            </h3>
            <p>Assists</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-3xl font-bold text-green-600">
              {profileComplete}%
            </h3>
            <p>Profile Complete</p>
          </div>

        </div>

      </div>
    </main>
  );
}