"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isArrayOf, isCareerHistoryEntry, isPlayer } from "../lib/types";
import type { Player } from "../lib/types";

export default function PlayerDashboard() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadIndex, setReloadIndex] = useState(0);

const [matches, setMatches] = useState(0);
const [goals, setGoals] = useState(0);
const [assists, setAssists] = useState(0);
const [profileComplete, setProfileComplete] = useState(20);
const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    async function loadPlayerStats(playerId: number) {
      const { data, error } = await supabase
        .from("career_history")
        .select("*")
        .eq("player_id", playerId);

      if (error) {
        console.error(error);
        return;
      }

      if (!isArrayOf(data, isCareerHistoryEntry)) return;

      const totalMatches =
        data.reduce((sum, club) => sum + Number(club.appearances || 0), 0) || 0;

      const totalGoals =
        data.reduce((sum, club) => sum + Number(club.goals || 0), 0) || 0;

      const totalAssists =
        data.reduce((sum, club) => sum + Number(club.assists || 0), 0) || 0;

      setMatches(totalMatches);
      setGoals(totalGoals);
      setAssists(totalAssists);
    }

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

      // Find player profile using their auth user_id (not email - email can change
      // and several player rows have no email at all)
      const { data, error } = await supabase
        .from("player")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("player-dashboard: failed to load player row:", error);
        setLoadError(true);
        setLoading(false);
        return;
      }

      if (data && isPlayer(data)) {
      setPlayer(data);
      loadPlayerStats(data.id);

      const fields: { key: keyof Player; label: string }[] = [
        { key: "full_name", label: "Full name" },
        { key: "photo_url", label: "Profile photo" },
        { key: "position", label: "Position" },
        { key: "current_club", label: "Current club" },
        { key: "nationality", label: "Nationality" },
        { key: "age", label: "Age" },
        { key: "height", label: "Height" },
        { key: "weight", label: "Weight" },
        { key: "bio", label: "Bio" },
        { key: "preferred_foot", label: "Preferred foot" },
      ];

      const missing = fields.filter((f) => !data[f.key]).map((f) => f.label);
      const score = (fields.length - missing.length) * (100 / fields.length);

      setMissingFields(missing);
      setProfileComplete(Math.round(score));
  }

      setLoading(false);
    }

    loadPlayer();
  }, [router, reloadIndex]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-2xl">
        Loading Dashboard...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-4">
        <p className="text-xl text-red-600">
          Something went wrong loading your dashboard.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setLoadError(false);
            setReloadIndex((i) => i + 1);
          }}
          className="bg-green-600 text-white px-6 py-3 rounded-lg"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-4">
        <p className="text-xl">
          You haven&apos;t completed your player profile yet.
        </p>
        <a
          href="/register-player"
          className="bg-green-600 text-white px-6 py-3 rounded-lg"
        >
          Complete Registration
        </a>
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

            <Image
              src={
                player.photo_url ||
                "https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=400"
              }
              alt={player.full_name || "Player"}
              width={112}
              height={112}
              className="w-28 h-28 rounded-full object-cover bg-gray-200"
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

        <div className="mb-8 flex gap-3 flex-wrap">
          <Link
            href="/messages"
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-xl font-semibold"
          >
            📨 Messages
          </Link>
          <Link
            href="/subscription"
            className="inline-block bg-white border border-gray-200 hover:border-amber-400 hover:text-amber-600 text-gray-700 px-5 py-2.5 rounded-xl font-semibold"
          >
            ⭐ Subscription
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">

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

        <div className="bg-white p-6 rounded-xl shadow mt-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-lg">Profile Completion</h3>
            <span className="text-green-700 font-semibold">
              {profileComplete}%
            </span>
          </div>

          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-green-600 h-3 rounded-full transition-all"
              style={{ width: `${profileComplete}%` }}
            />
          </div>

          {missingFields.length > 0 ? (
            <p className="text-sm text-gray-500 mt-3">
              Add {missingFields.join(", ")} to complete your profile and
              improve your visibility to scouts.
            </p>
          ) : (
            <p className="text-sm text-green-600 mt-3">
              Your profile is complete!
            </p>
          )}
        </div>

      </div>
    </main>
  );
}