"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function ClubDashboard() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

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
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8 flex items-center justify-center">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md p-8 sm:p-12 text-center">
        <div className="text-6xl mb-4">🏟️</div>

        <h1 className="text-3xl sm:text-4xl font-bold text-green-700 mb-4">
          Club Dashboard - Coming Soon
        </h1>

        <p className="text-gray-600 max-w-lg mx-auto mb-8">
          Thanks for registering your club with ScoutAfrica. We&apos;re actively
          building out full club functionality - including player discovery
          tools, trial management, and scouting pipelines tailored for
          organizations. This is coming in an upcoming release.
        </p>

        <div className="text-left bg-gray-50 rounded-xl p-6 mb-8">
          <h2 className="font-bold mb-3">What&apos;s coming for clubs:</h2>
          <ul className="space-y-2 text-gray-600 text-sm">
            <li>✓ Full club profile and verification</li>
            <li>✓ Player discovery and shortlisting tools</li>
            <li>✓ Trial creation and applicant management</li>
            <li>✓ Direct messaging with scouts and players</li>
          </ul>
        </div>

        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href="/find-players"
            className="inline-block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold"
          >
            Browse Players Now
          </a>
          <a
            href="/messages"
            className="inline-block bg-white border border-gray-200 hover:border-green-600 hover:text-green-700 text-gray-700 px-6 py-3 rounded-xl font-semibold"
          >
            📨 Messages
          </a>
        </div>
      </div>
    </main>
  );
}
