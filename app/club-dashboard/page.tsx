"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isClubProfile } from "../lib/types";
import type { ClubProfile } from "../lib/types";

interface ClubInfo {
  displayName: string;
  email: string;
  status: "pending" | "verified" | "rejected" | null;
}

type Stats = {
  playersViewed: number;
  watchlistCount: number;
  contactRequestsSent: number;
  activeConversations: number;
};

const EMPTY_STATS: Stats = {
  playersViewed: 0,
  watchlistCount: 0,
  contactRequestsSent: 0,
  activeConversations: 0,
};

export default function ClubDashboard() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [clubInfo, setClubInfo] = useState<ClubInfo | null>(null);
  const [clubProfile, setClubProfile] = useState<ClubProfile | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    // Defense-in-depth: proxy.ts is the primary route guard for this page. This check
    // exists in case that layer is misconfigured (see Sprint 1A follow-up investigation).
    // user_metadata.account_type is a UX/routing check only, never a security boundary.
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      if (user.user_metadata?.account_type !== "club") {
        router.replace("/");
        return;
      }

      setCheckingAccess(false);
      loadDashboard(user.id, user.user_metadata?.full_name, user.email);
    }

    async function loadDashboard(userId: string, fallbackName: string | undefined, fallbackEmail: string | undefined) {
      const [verification, profile, views, watchlist, requestsSent, activeConvos] = await Promise.all([
        supabase
          .from("account_verifications")
          .select("display_name, email, status")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase.from("club_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("player_views")
          .select("*", { count: "exact", head: true })
          .eq("viewer_id", userId),
        supabase
          .from("watchlist")
          .select("*", { count: "exact", head: true })
          .eq("scout_id", userId),
        supabase
          .from("contact_requests")
          .select("*", { count: "exact", head: true })
          .eq("sender_id", userId),
        supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("scout_id", userId)
          .eq("active", true),
      ]);

      if (profile.data && isClubProfile(profile.data)) {
        setClubProfile(profile.data);
      }

      const verificationRow =
        verification.data && typeof verification.data === "object" ? verification.data : null;

      setClubInfo({
        displayName:
          (profile.data && isClubProfile(profile.data) ? profile.data.club_name : null) ||
          (verificationRow && "display_name" in verificationRow ? (verificationRow.display_name as string) : null) ||
          fallbackName ||
          "Your Club",
        email:
          (verificationRow && "email" in verificationRow ? (verificationRow.email as string) : null) ||
          fallbackEmail ||
          "",
        status:
          verificationRow && "status" in verificationRow
            ? (verificationRow.status as ClubInfo["status"])
            : null,
      });

      setStats({
        playersViewed: views.count ?? 0,
        watchlistCount: watchlist.count ?? 0,
        contactRequestsSent: requestsSent.count ?? 0,
        activeConversations: activeConvos.count ?? 0,
      });

      setLoadingStats(false);
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

  const statCards: { label: string; value: number; icon: string }[] = [
    { label: "Total Players Viewed", value: stats.playersViewed, icon: "👀" },
    { label: "Watchlist Count", value: stats.watchlistCount, icon: "⭐" },
    { label: "Contact Requests Sent", value: stats.contactRequestsSent, icon: "✉️" },
    { label: "Active Conversations", value: stats.activeConversations, icon: "💬" },
  ];

  const statusStyle =
    clubInfo?.status === "verified"
      ? "bg-green-100 text-green-800"
      : clubInfo?.status === "rejected"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";

  const statusLabel =
    clubInfo?.status === "verified"
      ? "🟢 Verified"
      : clubInfo?.status === "rejected"
        ? "⚫ Rejected"
        : clubInfo?.status === "pending"
          ? "🟡 Pending Review"
          : "🔴 Not Verified";

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Club info header */}
        <div className="relative rounded-3xl overflow-hidden mb-8 shadow-xl">
          <div className="relative h-32 sm:h-40 bg-gradient-to-r from-green-600 to-green-800">
            {clubProfile?.cover_photo_url && (
              <Image src={clubProfile.cover_photo_url} alt="Club cover" fill className="object-cover" />
            )}
            <div className="absolute inset-0 bg-black/20" />
          </div>

          <div className="bg-white px-6 sm:px-8 pb-6 pt-0">
            <div className="flex flex-wrap items-end gap-4 -mt-10">
              <div className="relative w-20 h-20 rounded-full border-4 border-white shadow-lg overflow-hidden bg-gray-100 shrink-0">
                {clubProfile?.logo_url ? (
                  <Image src={clubProfile.logo_url} alt="Club logo" fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl bg-gray-800 text-white">
                    🏟️
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                  {clubInfo?.displayName || "Your Club"}
                </h1>
                {clubInfo?.email && (
                  <p className="text-gray-500 text-sm truncate">{clubInfo.email}</p>
                )}
              </div>

              <a
                href="/verification"
                className={`text-xs font-semibold px-3 py-1 rounded-full mb-1 ${statusStyle} ${
                  clubInfo?.status === "verified" ? "" : "hover:underline"
                }`}
              >
                {statusLabel}
              </a>

              <a
                href="/edit-club-profile"
                className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-xl mb-1"
              >
                Edit Profile
              </a>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10">
          {statCards.map((card) => (
            <div key={card.label} className="bg-white rounded-2xl shadow-sm p-5">
              <div className="text-2xl mb-2">{card.icon}</div>
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-3xl font-bold text-green-700 mt-1">
                {loadingStats ? "…" : card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-3 gap-5 mb-10">
          <a
            href="/find-players"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Browse Players →</p>
            <p className="text-gray-300 text-sm mt-1">Discover and shortlist talent</p>
          </a>
          <a
            href="/scout-dashboard/watchlist"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Watchlist →</p>
            <p className="text-gray-300 text-sm mt-1">Players you&apos;re tracking</p>
          </a>
          <a
            href="/messages"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Messages →</p>
            <p className="text-gray-300 text-sm mt-1">Your active conversations</p>
          </a>
        </div>

        {/* Coming soon, preserved from the previous placeholder */}
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <h2 className="font-bold text-lg mb-3">More club tools are on the way</h2>
          <ul className="space-y-2 text-gray-600 text-sm">
            <li>✓ Full club profile customization</li>
            <li>✓ Trial creation and applicant management</li>
            <li>✓ Scouting pipelines tailored for organizations</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
