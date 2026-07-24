"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Counts = {
  pendingPlayerVerifications: number;
  pendingClubApprovals: number;
  pendingScoutApprovals: number;
  pendingContactRequests: number;
  pendingPlayerReports: number;
  verifiedPlayers: number;
  verifiedClubs: number;
  verifiedScouts: number;
};

const EMPTY_COUNTS: Counts = {
  pendingPlayerVerifications: 0,
  pendingClubApprovals: 0,
  pendingScoutApprovals: 0,
  pendingContactRequests: 0,
  pendingPlayerReports: 0,
  verifiedPlayers: 0,
  verifiedClubs: 0,
  verifiedScouts: 0,
};

export default function AdminPanel() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    // Defense-in-depth: proxy.ts is the primary route guard for this page. This check
    // exists in case that layer is misconfigured (see Sprint 1A follow-up investigation
    // - this is exactly what happened, so this check is not optional here). Unlike the
    // other dashboards, this checks app_metadata.is_admin, which the client cannot edit,
    // so this check is a real (if secondary) security boundary, not just UX.
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/signin");
        return;
      }

      if (user.app_metadata?.is_admin !== true) {
        router.replace("/");
        return;
      }

      setCheckingAccess(false);
      loadCounts();
    }

    async function loadCounts() {
      // player.verified currently doubles as "not yet reviewed" (null/false)
      // vs verified (true) - there's no separate "rejected" state for
      // players today (only club/scout have a 3-state status), consistent
      // with how player verification has worked since it was first added.
      const [
        pendingPlayers,
        verifiedPlayers,
        pendingClubs,
        verifiedClubs,
        pendingScouts,
        verifiedScouts,
        pendingRequests,
        pendingReports,
      ] = await Promise.all([
        supabase.from("player").select("*", { count: "exact", head: true }).or("verified.is.null,verified.eq.false"),
        supabase.from("player").select("*", { count: "exact", head: true }).eq("verified", true),
        supabase.from("account_verifications").select("*", { count: "exact", head: true }).eq("account_type", "club").eq("status", "pending"),
        supabase.from("account_verifications").select("*", { count: "exact", head: true }).eq("account_type", "club").eq("status", "verified"),
        supabase.from("account_verifications").select("*", { count: "exact", head: true }).eq("account_type", "scout").eq("status", "pending"),
        supabase.from("account_verifications").select("*", { count: "exact", head: true }).eq("account_type", "scout").eq("status", "verified"),
        supabase.from("contact_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("player_reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      setCounts({
        pendingPlayerVerifications: pendingPlayers.count ?? 0,
        verifiedPlayers: verifiedPlayers.count ?? 0,
        pendingClubApprovals: pendingClubs.count ?? 0,
        verifiedClubs: verifiedClubs.count ?? 0,
        pendingScoutApprovals: pendingScouts.count ?? 0,
        verifiedScouts: verifiedScouts.count ?? 0,
        pendingContactRequests: pendingRequests.count ?? 0,
        pendingPlayerReports: pendingReports.count ?? 0,
      });
      setLoadingCounts(false);
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

  const cards: { label: string; value: number; href: string; tone: "pending" | "verified" }[] = [
    { label: "Pending Player Verifications", value: counts.pendingPlayerVerifications, href: "/admin/verifications?type=player", tone: "pending" },
    { label: "Pending Club Approvals", value: counts.pendingClubApprovals, href: "/admin/verifications?type=club", tone: "pending" },
    { label: "Pending Scout Approvals", value: counts.pendingScoutApprovals, href: "/admin/verifications?type=scout", tone: "pending" },
    { label: "Pending Contact Requests", value: counts.pendingContactRequests, href: "/admin/contact-requests", tone: "pending" },
    { label: "Pending Player Reports", value: counts.pendingPlayerReports, href: "/admin/player-reports", tone: "pending" },
    { label: "Verified Players", value: counts.verifiedPlayers, href: "/admin/verifications?type=player", tone: "verified" },
    { label: "Verified Clubs", value: counts.verifiedClubs, href: "/admin/verifications?type=club", tone: "verified" },
    { label: "Verified Scouts", value: counts.verifiedScouts, href: "/admin/verifications?type=scout", tone: "verified" },
  ];

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl sm:text-5xl font-bold text-green-700 mb-2">
          ScoutAfrica Admin Control Center
        </h1>
        <p className="text-gray-500 mb-8">
          Platform oversight: verifications, contact requests, and reports.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              className="bg-white rounded-2xl shadow-md p-5 hover:shadow-lg transition block"
            >
              <p className="text-sm text-gray-500">{card.label}</p>
              <p
                className={`text-4xl font-bold mt-2 ${
                  card.tone === "pending" && card.value > 0 ? "text-amber-600" : "text-green-600"
                }`}
              >
                {loadingCounts ? "…" : card.value}
              </p>
            </Link>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
          <Link
            href="/admin/contact-requests"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Contact Requests →</p>
            <p className="text-gray-300 text-sm mt-1">Review, approve, or reject requests</p>
          </Link>
          <Link
            href="/admin/player-reports"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Player Reports →</p>
            <p className="text-gray-300 text-sm mt-1">Review reported profiles</p>
          </Link>
          <Link
            href="/admin/verifications"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Verifications →</p>
            <p className="text-gray-300 text-sm mt-1">Players, clubs, and scouts</p>
          </Link>
          <Link
            href="/admin/conversations"
            className="bg-black text-white rounded-2xl p-6 hover:bg-gray-800 transition"
          >
            <p className="font-bold text-lg">Conversation Monitor →</p>
            <p className="text-gray-300 text-sm mt-1">Oversight of active conversations</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
