"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "../../lib/supabase";
import { isClubProfile } from "../../lib/types";
import type { ClubProfile, ClubPublicStats } from "../../lib/types";
import { CountryFlag } from "../../lib/CountryFlag";
import PremiumBadge from "../../components/PremiumBadge";

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
      <main className="min-h-screen bg-gray-100 pb-12">
        <div className="animate-pulse">
          <div className="w-full h-[340px] bg-gray-300" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="w-[180px] h-[180px] -mt-[90px] rounded-full bg-gray-300 border-4 border-white" />
            <div className="h-6 w-56 bg-gray-200 rounded mt-4" />
            <div className="h-4 w-40 bg-gray-200 rounded mt-2" />
          </div>
        </div>
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
    <main className="min-h-screen bg-gray-100 pb-12 animate-fade-in">
      <div className="relative w-full h-[340px] rounded-2xl overflow-hidden bg-gray-800 shadow-lg ring-1 ring-black/5">
        {club.cover_photo_url ? (
          <Image src={club.cover_photo_url} alt="Club cover" fill className="object-cover" priority />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-gray-800 to-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="relative w-[180px] h-[180px] -mt-[90px] rounded-full border-4 border-white shadow-2xl ring-1 ring-black/5 overflow-hidden bg-gray-200 shrink-0 transition-transform duration-300 hover:scale-[1.02]">
            {club.logo_url ? (
              <Image src={club.logo_url} alt={club.club_name || "Club"} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl">🏟️</div>
            )}
          </div>

          <div className="pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                {club.club_name || "Unnamed Club"}
              </h1>
              {verified ? (
                <span className="inline-flex items-center gap-1 bg-green-600 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  ✓ Verified
                </span>
              ) : (
                <span className="inline-flex items-center bg-gray-100 text-gray-500 text-xs font-semibold px-2.5 py-1 rounded-full">
                  Not Verified
                </span>
              )}
              <PremiumBadge userId={club.user_id} />
            </div>
            <div className="mt-2 space-y-1">
              <p className="text-gray-700 font-medium flex items-center gap-2">
                <CountryFlag country={club.country} />
                {club.country || "Country not set"}
              </p>
              <p className="text-gray-700 font-medium flex items-center gap-2">
                📍 {club.city || "City not set"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mt-8">
          <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 border border-gray-100">
            <h2 className="font-bold text-lg mb-3">About the Club</h2>
            <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">
              {club.description || "This club has not added a description yet."}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 space-y-3 border border-gray-100">
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
          <div className="bg-white rounded-2xl shadow-sm hover:shadow-md p-5 text-center border border-gray-100 transition-all duration-200 hover:-translate-y-1">
            <div className="text-2xl mb-1">👀</div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{stats.players_viewed}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Players Viewed</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm hover:shadow-md p-5 text-center border border-gray-100 transition-all duration-200 hover:-translate-y-1">
            <div className="text-2xl mb-1">⭐</div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{stats.watchlist_count}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Watchlist</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm hover:shadow-md p-5 text-center border border-gray-100 transition-all duration-200 hover:-translate-y-1">
            <div className="text-2xl mb-1">✉️</div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{stats.contact_requests_sent}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">Requests Sent</p>
          </div>
        </div>
      </div>
    </main>
  );
}
