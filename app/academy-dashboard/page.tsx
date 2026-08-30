"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "../lib/supabase";
import { isAcademyProfile } from "../lib/types";
import type { AcademyProfile } from "../lib/types";
import { CountryFlag } from "../lib/CountryFlag";
import PremiumBadge from "../components/PremiumBadge";
import UpgradeBanner from "../components/UpgradeBanner";

interface AcademyInfo {
  displayName: string;
  email: string;
  status: "pending" | "verified" | "rejected" | null;
}

type Stats = {
  talentScouted: number;
  watchlistCount: number;
  opportunitiesCreated: number;
  activeConversations: number;
};

const EMPTY_STATS: Stats = {
  talentScouted: 0,
  watchlistCount: 0,
  opportunitiesCreated: 0,
  activeConversations: 0,
};

export default function AcademyDashboard() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [academyInfo, setAcademyInfo] = useState<AcademyInfo | null>(null);
  const [academyProfile, setAcademyProfile] =
    useState<AcademyProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      if (user.user_metadata?.account_type !== "academy") {
        router.replace("/");
        return;
      }

      setCheckingAccess(false);
      setUserId(user.id);

      loadDashboard(
        user.id,
        user.user_metadata?.full_name,
        user.email
      );
    }

    async function loadDashboard(
      userId: string,
      fallbackName: string | undefined,
      fallbackEmail: string | undefined
    ) {
      const [
        verification,
        profile,
        views,
        watchlist,
        requestsSent,
        activeConvos,
      ] = await Promise.all([
        supabase
          .from("account_verifications")
          .select("display_name, email, status")
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("academy_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),

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

      if (profile.data && isAcademyProfile(profile.data)) {
        setAcademyProfile(profile.data);
      }

      const verificationRow =
        verification.data &&
        typeof verification.data === "object"
          ? verification.data
          : null;

      const computedDisplayName =
        (profile.data && isAcademyProfile(profile.data)
          ? profile.data.academy_name
          : null) ||
        (verificationRow && "display_name" in verificationRow
          ? (verificationRow.display_name as string)
          : null) ||
        fallbackName ||
        "Your Academy";

      setAcademyInfo({
        displayName: computedDisplayName,
        email:
          (verificationRow && "email" in verificationRow
            ? (verificationRow.email as string)
            : null) ||
          fallbackEmail ||
          "",
        status:
          verificationRow && "status" in verificationRow
            ? (verificationRow.status as AcademyInfo["status"])
            : null,
      });

      setStats({
        talentScouted: views.count ?? 0,
        watchlistCount: watchlist.count ?? 0,
        opportunitiesCreated: requestsSent.count ?? 0,
        activeConversations: activeConvos.count ?? 0,
      });

      setLoadingStats(false);
    }

    checkAccess();
  }, [router]);

  if (checkingAccess) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto animate-pulse">
          <div className="h-[340px] rounded-3xl bg-gray-200 mb-8" />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-gray-200"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  const statCards: {
    label: string;
    value: number;
    icon: string;
  }[] = [
    {
      label: "Young Talent Scouted",
      value: stats.talentScouted,
      icon: "🔍",
    },
    {
      label: "Talent Watchlist",
      value: stats.watchlistCount,
      icon: "⭐",
    },
    {
      label: "Prospects Contacted",
      value: stats.opportunitiesCreated,
      icon: "📣",
    },
    {
      label: "Active Conversations",
      value: stats.activeConversations,
      icon: "💬",
    },
  ];

  const statusStyle =
    academyInfo?.status === "verified"
      ? "bg-green-100 text-green-800"
      : academyInfo?.status === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-800";

  const statusLabel =
    academyInfo?.status === "verified"
      ? "🟢 Verified"
      : academyInfo?.status === "rejected"
      ? "⚫ Rejected"
      : academyInfo?.status === "pending"
      ? "🟡 Pending Review"
      : "🔴 Not Verified";

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto animate-fade-in">

        <div className="relative rounded-3xl overflow-hidden mb-8 shadow-xl ring-1 ring-black/5">

          <div className="relative h-[340px] bg-gradient-to-r from-green-600 to-green-800">
            {academyProfile?.cover_photo_url && (
              <Image
                src={academyProfile.cover_photo_url}
                alt="Academy cover"
                fill
                className="object-cover"
                priority
              />
            )}

            <div className="absolute inset-0 bg-black/20" />
          </div>

          <div className="bg-white px-6 sm:px-8 pb-6 pt-0">
            <div className="flex flex-wrap items-center gap-4">

              <div className="relative w-[180px] h-[180px] -mt-[90px] rounded-full border-4 border-white shadow-2xl ring-1 ring-black/5 overflow-hidden bg-gray-100 shrink-0 transition-transform duration-300 hover:scale-[1.02]">

                {academyProfile?.logo_url ? (
                  <Image
                    src={academyProfile.logo_url}
                    alt="Academy logo"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl bg-gray-800 text-white">
                    🎓
                  </div>
                )}

              </div>

              <div className="min-w-0 flex-1 pb-1">

                <div className="flex flex-wrap items-center gap-2">

                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight truncate">
                    {academyInfo?.displayName || "Your Academy"}
                  </h1>

                  <a
                    href="/verification"
                    className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all duration-200 ${statusStyle} ${
                      academyInfo?.status === "verified"
                        ? "hover:shadow-sm"
                        : "hover:underline"
                    }`}
                  >
                    {statusLabel}
                  </a>

                  <PremiumBadge userId={userId} />

                </div>

                <div className="mt-2 space-y-1">

                  <p className="text-gray-700 font-medium flex items-center gap-2">
                    <CountryFlag country={academyProfile?.country} />
                    {academyProfile?.country || "Country not set"}
                  </p>

                  <p className="text-gray-700 font-medium flex items-center gap-2">
                    📍 {academyProfile?.city || "City not set"}
                  </p>

                </div>

              </div>

              <a
                href="/edit-academy-profile"
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white text-sm font-semibold px-5 py-2.5 rounded-xl mb-1 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
              >
                Edit Profile
              </a>

            </div>
          </div>
        </div>

        <UpgradeBanner />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-10">

          {statCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg p-5 sm:p-6 border border-gray-100 transition-all duration-200 hover:-translate-y-1"
            >

              <div className="w-11 h-11 rounded-xl bg-green-50 flex items-center justify-center text-2xl mb-3">
                {card.icon}
              </div>

              <p className="text-sm text-gray-500 font-medium">
                {card.label}
              </p>

              <p className="text-3xl font-bold text-gray-900 mt-1 tracking-tight">
                {loadingStats ? (
                  <span className="inline-block h-8 w-14 bg-gray-100 rounded animate-pulse" />
                ) : (
                  card.value
                )}
              </p>

            </div>
          ))}

        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">

          <a
            href="/find-players"
            className="group bg-black text-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
          >
            <p className="font-bold text-lg flex items-center gap-1">
              Scout Young Talent
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </p>

            <p className="text-gray-300 text-sm mt-1">
              Discover prospects for your academy
            </p>
          </a>

          <a
            href="/scout-dashboard/watchlist"
            className="group bg-black text-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
          >
            <p className="font-bold text-lg flex items-center gap-1">
              Talent Watchlist
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </p>

            <p className="text-gray-300 text-sm mt-1">
              Prospects you&apos;re tracking
            </p>
          </a>

          <a
            href="/messages"
            className="group bg-black text-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
          >
            <p className="font-bold text-lg flex items-center gap-1">
              Messages
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </p>

            <p className="text-gray-300 text-sm mt-1">
              Conversations with clubs and scouts
            </p>
          </a>

          <a
            href="/membership"
            className="group bg-black text-white rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
          >
            <p className="font-bold text-lg flex items-center gap-1">
              Subscription
              <span className="transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </p>

            <p className="text-gray-300 text-sm mt-1">
              ⭐ Manage your Premium plan
            </p>
          </a>

        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8 border border-gray-100">

          <h2 className="font-bold text-lg mb-3">
            Academy development tools are on the way
          </h2>

          <ul className="space-y-2 text-gray-600 text-sm">
            <li>✓ Player development tracking for your academy roster</li>
            <li>✓ Showcase your academy&apos;s players directly to scouts and clubs</li>
            <li>✓ Create trial and opportunity listings</li>
            <li>✓ Talent pipeline and progress reports</li>
          </ul>

        </div>

      </div>
    </main>
  );
}