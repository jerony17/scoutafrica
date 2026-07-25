"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { isClubProfile } from "../../lib/types";
import type { ClubProfile, ClubPublicStats } from "../../lib/types";
import { CountryFlag } from "../../lib/CountryFlag";

const EMPTY_STATS: ClubPublicStats = {
  players_viewed: 0,
  watchlist_count: 0,
  contact_requests_sent: 0,
};

export default function ClubProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [club, setClub] = useState<ClubProfile | null>(null);
  const [verified, setVerified] = useState(false);
  const [stats, setStats] = useState<ClubPublicStats>(EMPTY_STATS);

  useEffect(() => {
    async function loadClub() {
      const [profileResult, verificationResult, statsResult] = await Promise.all([
        supabase.from("club_profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase
          .from("account_verifications")
          .select("status")
          .eq("user_id", id)
          .eq("account_type", "club")
          .maybeSingle(),
        supabase.rpc("get_club_public_stats", { p_user_id: id }),
      ]);

      if (profileResult.data && isClubProfile(profileResult.data)) {
        setClub(profileResult.data);
      }

      if (
        verificationResult.data &&
        typeof verificationResult.data === "object" &&
        "status" in verificationResult.data
      ) {
        const row = verificationResult.data;
        const rawStatus = row.status as "pending" | "verified" | "rejected";
        setVerified(rawStatus === "verified");
      }

      if (Array.isArray(statsResult.data) && statsResult.data.length > 0) {
        const row = statsResult.data[0];
        setStats({
          players_viewed: Number(row.players_viewed) || 0,
          watchlist_count: Number(row.watchlist_count) || 0,
          contact_requests_sent: Number(row.contact_requests_sent) || 0,
        });
      }

      setLoading(false);
    }

    loadClub();
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Loading...
      </main>
    );
  }

  if (!club) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        Club profile not found.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 pb-12">
      <div className="relative w-full h-56 sm:h-72 bg-gray-800">
        {club.cover_photo_url ? (
          <Image src={club.cover_photo_url} alt="Club cover" fill className="object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-gray-800 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="-mt-16 flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gray-200 shrink-0">
            {club.logo_url ? (
              <Image src={club.logo_url} alt={club.club_name || "Club"} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl">🏟️</div>
            )}
          </div>

          <div className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                {club.club_name || "Unnamed Club"}
              </h1>
              {verified && (
                <span className="inline-flex items-center gap-1 bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  ✓ Verified
                </span>
              )}
            </div>
            <p className="text-gray-500 flex items-center gap-2 mt-1">
              <CountryFlag country={club.country} />
              {[club.city, club.country].filter(Boolean).join(", ") || "Location not provided"}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-8">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="font-bold text-lg mb-3">About the Club</h2>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
              {club.description || "This club has not added a description yet."}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Founded</span>
              <span className="font-medium text-gray-900">{club.founded_year || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Stadium</span>
              <span className="font-medium text-gray-900">{club.stadium || "—"}</span>
            </div>
            {club.website && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Website</span>
                <a
                  href={club.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-green-700 hover:underline truncate max-w-[60%]"
                >
                  {club.website}
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-green-700">{stats.players_viewed}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Players Viewed</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-green-700">{stats.watchlist_count}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Watchlist</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5 text-center">
            <p className="text-2xl sm:text-3xl font-bold text-green-700">{stats.contact_requests_sent}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Requests Sent</p>
          </div>
        </div>
      </div>
    </main>
  );
}
